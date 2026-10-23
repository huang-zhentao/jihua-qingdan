import { app } from 'electron'
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { dirname, join } from 'node:path'

const KEEP_BACKUPS = 14

function dataDir(): string {
  return app.getPath('userData')
}

/**
 * 数据文件候选位置：
 * 1. 用户数据目录（标准做法）
 * 2. exe 同级目录（便携模式；用户数据目录不可写时兜底，例如受限环境或只读 U 盘）
 */
function candidates(): string[] {
  return [join(dataDir(), 'data.json'), join(dirname(process.execPath), 'data.json')]
}

export function dataFilePath(): string {
  return candidates()[0]
}

/** data.json 解析失败时，把原始内容原样存一份，避免用户丢数据 */
export function backupBroken(raw: string): string | null {
  try {
    const dir = join(dirname(candidates()[0]), 'backups')
    mkdirSync(dir, { recursive: true })
    const target = join(dir, `data-broken-${Date.now()}.json`)
    writeFileSync(target, raw, 'utf8')
    return target
  } catch {
    return null
  }
}

function backupDirFor(file: string): string {
  return join(dirname(file), 'backups')
}

/** 读取原始 JSON 文本；都读不到返回 null，由渲染进程决定初始化 */
export function readData(): string | null {
  for (const file of candidates()) {
    try {
      return readFileSync(file, 'utf8')
    } catch {
      // 换下一个位置
    }
  }
  return null
}

function todayStamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 每天第一次写入前，把现有文件复制一份到 backups/，并清理过期备份 */
function backupIfNeeded(file: string): void {
  if (!existsSync(file)) return
  try {
    const dir = backupDirFor(file)
    mkdirSync(dir, { recursive: true })
    const target = join(dir, `data-${todayStamp()}.json`)
    if (!existsSync(target)) copyFileSync(file, target)

    const files = readdirSync(dir)
      .filter((f) => f.startsWith('data-') && f.endsWith('.json'))
      .sort()
    while (files.length > KEEP_BACKUPS) {
      const oldest = files.shift()!
      try {
        unlinkSync(join(dir, oldest))
      } catch {
        // 单个备份删不掉不影响主流程
      }
    }
  } catch {
    // 备份失败不阻断保存
  }
}

/** 原子写入：先写 .tmp 并 fsync，再 rename 覆盖，避免断电写坏文件 */
export function writeData(raw: string): { ok: boolean; error?: string; path?: string } {
  try {
    JSON.parse(raw)
  } catch (err) {
    return { ok: false, error: `不是合法 JSON: ${(err as Error).message}` }
  }

  let lastError = ''
  for (const file of candidates()) {
    try {
      mkdirSync(dirname(file), { recursive: true })
      backupIfNeeded(file)
      const tmp = `${file}.tmp`
      const fd = openSync(tmp, 'w')
      try {
        writeSync(fd, raw)
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      renameSync(tmp, file)
      return { ok: true, path: file }
    } catch (err) {
      lastError = (err as Error).message
      try {
        unlinkSync(`${file}.tmp`)
      } catch {
        // ignore
      }
    }
  }
  return { ok: false, error: lastError }
}

/** 手动备份，返回生成的文件名 */
export function backupNow(): string | null {  for (const file of candidates()) {
    if (!existsSync(file)) continue
    try {
      const dir = backupDirFor(file)
      mkdirSync(dir, { recursive: true })
      const d = new Date()
      const p = (n: number): string => String(n).padStart(2, '0')
      const stamp = `${todayStamp()}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
      const target = join(dir, `data-${stamp}.json`)
      copyFileSync(file, target)
      return target
    } catch {
      return null
    }
  }
  return null
}
