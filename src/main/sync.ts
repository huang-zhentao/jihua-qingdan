import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { liveTaskCount, mergeDocs } from './merge'
import type { AppData } from '../renderer/src/domain/types'

export interface SyncConfig {
  url: string
  username: string
  password: string
}

export type SyncState = 'off' | 'syncing' | 'ok' | 'error'

export interface SyncStatus {
  state: SyncState
  at?: string
  message?: string
  count?: number
}

const REMOTE_DIR = 'jihua-qingdan'
const REMOTE_FILE = `${REMOTE_DIR}/data.json`

let status: SyncStatus = { state: 'off' }
let etag: string | null = null
let loadBroken = false

function statePath(): string {
  return join(app.getPath('userData'), 'sync-state.json')
}

/** 上次同步时间存在本地，不进 data.json，避免同步触发自身 */
function loadState(): void {
  try {
    const raw = JSON.parse(readFileSync(statePath(), 'utf8')) as { at?: string; count?: number }
    if (raw.at) status = { state: 'ok', at: raw.at, count: raw.count }
  } catch {
    // 没有就当作未同步
  }
}

function saveState(next: SyncStatus): void {
  try {
    mkdirSync(dirname(statePath()), { recursive: true })
    writeFileSync(statePath(), JSON.stringify({ at: next.at, count: next.count }), 'utf8')
  } catch {
    // 写不了也不影响同步
  }
}

loadState()

export function configBroken(): boolean {
  return loadBroken
}

function secretsPath(): string {
  return join(app.getPath('userData'), 'secrets.bin')
}

export function loadConfig(): SyncConfig | null {
  loadBroken = false
  try {
    const text = readFileSync(secretsPath(), 'utf8').trim()
    let raw: string
    if (text.startsWith('enc:')) {
      raw = safeStorage.decryptString(Buffer.from(text.slice(4), 'base64'))
    } else if (text.startsWith('raw:')) {
      raw = text.slice(4)
    } else {
      // 兼容早期版本：直接写的二进制密文或明文 JSON
      try {
        raw = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(readFileSync(secretsPath()))
          : text
      } catch {
        raw = text
      }
    }
    const cfg = JSON.parse(raw) as SyncConfig
    if (!cfg.url || !cfg.username) return null
    return cfg
  } catch (err) {
    // 文件存在但解不开（例如上次被强杀、系统密钥没落盘），提示用户重填
    try {
      if (readFileSync(secretsPath()).length > 0) loadBroken = true
    } catch {
      // 文件不存在，不算异常
    }
    console.error('[sync] loadConfig failed:', err)
    return null
  }
}

export function saveConfig(cfg: SyncConfig): void {
  mkdirSync(dirname(secretsPath()), { recursive: true })
  const raw = JSON.stringify(cfg)
  let payload: string
  if (safeStorage.isEncryptionAvailable()) {
    try {
      payload = `enc:${safeStorage.encryptString(raw).toString('base64')}`
    } catch {
      payload = `raw:${raw}`
    }
  } else {
    payload = `raw:${raw}`
  }
  writeFileSync(secretsPath(), payload, 'utf8')
}

export function getStatus(): SyncStatus {
  return status
}

function baseUrl(cfg: SyncConfig): string {
  return cfg.url.endsWith('/') ? cfg.url : `${cfg.url}/`
}

function fileUrl(cfg: SyncConfig): string {
  return baseUrl(cfg) + REMOTE_FILE.split('/').map(encodeURIComponent).join('/')
}

function dirUrl(cfg: SyncConfig): string {
  return baseUrl(cfg) + encodeURIComponent(REMOTE_DIR) + '/'
}

function auth(cfg: SyncConfig): string {
  return `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`
}

async function ensureDir(cfg: SyncConfig): Promise<void> {
  const res = await fetch(dirUrl(cfg), {
    method: 'PROPFIND',
    headers: { Authorization: auth(cfg), Depth: '0' }
  })
  if (res.status === 404) {
    const created = await fetch(dirUrl(cfg), { method: 'MKCOL', headers: { Authorization: auth(cfg) } })
    if (!created.ok && created.status !== 405) {
      throw new Error(`创建远端目录失败 HTTP ${created.status}`)
    }
  } else if (!res.ok && res.status !== 207) {
    throw new Error(`远端目录不可用 HTTP ${res.status}`)
  }
}

async function pull(cfg: SyncConfig): Promise<{ doc: AppData | null; etag: string | null }> {
  const res = await fetch(fileUrl(cfg), { headers: { Authorization: auth(cfg) } })
  if (res.status === 404) return { doc: null, etag: null }
  if (!res.ok) throw new Error(`拉取失败 HTTP ${res.status}`)
  const text = await res.text()
  try {
    return { doc: JSON.parse(text) as AppData, etag: res.headers.get('etag') }
  } catch {
    throw new Error('远端文件不是合法 JSON，已跳过本次合并')
  }
}

async function push(cfg: SyncConfig, raw: string): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: auth(cfg),
    'Content-Type': 'application/json; charset=utf-8'
  }
  if (etag) headers['If-Match'] = etag
  else headers['If-None-Match'] = '*'

  const res = await fetch(fileUrl(cfg), { method: 'PUT', headers, body: raw })
  if (!res.ok && res.status !== 412) {
    throw new Error(`上传失败 HTTP ${res.status}`)
  }
  if (res.status === 412) {
    throw new Error('远端文件已被其他设备修改，请重试')
  }
  etag = res.headers.get('etag')
}

export async function testConnection(cfg: SyncConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(baseUrl(cfg), {
      method: 'PROPFIND',
      headers: { Authorization: auth(cfg), Depth: '0' }
    })
    if (res.status === 401) return { ok: false, message: '账号或应用密码不对（401）' }
    if (!res.ok && res.status !== 207) return { ok: false, message: `服务器返回 HTTP ${res.status}` }
    return { ok: true, message: '连接成功' }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}

export async function syncNow(localRaw: string): Promise<{ ok: boolean; raw?: string; status: SyncStatus }> {
  const cfg = loadConfig()
  if (!cfg) {
    status = { state: 'off' }
    return { ok: false, status }
  }

  status = { state: 'syncing' }
  try {
    const local = JSON.parse(localRaw) as AppData
    await ensureDir(cfg)

    const remote = await pull(cfg)
    const merged = remote.doc
      ? mergeDocs(local, remote.doc)
      : { doc: local, localChanged: false, remoteChanged: true }

    if (!remote.doc || merged.remoteChanged) {
      await push(cfg, JSON.stringify(merged.doc))
    }

    status = { state: 'ok', at: new Date().toISOString(), count: liveTaskCount(merged.doc) }
    saveState(status)
    return { ok: true, raw: JSON.stringify(merged.doc), status }
  } catch (err) {
    status = { state: 'error', at: new Date().toISOString(), message: (err as Error).message }
    return { ok: false, status }
  }
}

/** 远端有更新时用来重置缓存（例如用户换了服务器） */
export function resetSyncCache(): void {
  etag = null
  status = { state: 'off' }
}
