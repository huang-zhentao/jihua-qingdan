import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface AiProvider {
  id: string
  name: string
  baseUrl: string
  model: string
}

export const AI_PROVIDERS: AiProvider[] = [
  { id: 'deepseek', name: 'DeepSeek（默认）', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'kimi', name: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  { id: 'custom', name: '自定义（OpenAI 兼容）', baseUrl: '', model: '' }
]

export interface AiConfig {
  provider: string
  baseUrl: string
  model: string
}

const DEFAULT_CONFIG: AiConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat'
}

function configPath(): string {
  return join(app.getPath('userData'), 'ai.json')
}

function keyPath(): string {
  return join(app.getPath('userData'), 'ai-secret.bin')
}

export function loadAiConfig(): AiConfig {
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as AiConfig
    return { ...DEFAULT_CONFIG, ...raw }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveAiConfig(cfg: AiConfig): void {
  mkdirSync(dirname(configPath()), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8')
}

export function hasApiKey(): boolean {
  try {
    return readFileSync(keyPath()).length > 0
  } catch {
    return false
  }
}

export function saveApiKey(key: string): void {
  mkdirSync(dirname(keyPath()), { recursive: true })
  const trimmed = key.trim()
  const payload = safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(trimmed).toString('base64')}` : `raw:${trimmed}`
  writeFileSync(keyPath(), payload, 'utf8')
}

export function loadApiKey(): string {
  try {
    const text = readFileSync(keyPath(), 'utf8').trim()
    if (text.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(text.slice(4), 'base64'))
    if (text.startsWith('raw:')) return text.slice(4)
    return text
  } catch {
    return ''
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * API Key 只允许可打印 ASCII。
 * 常见问题：从网页/聊天里复制时带进了中文说明、全角空格、零宽字符，
 * 直接塞进 Authorization 头会报 "Cannot convert argument to a ByteString"。
 */
export function sanitizeKey(raw: string): { key: string; error?: string } {
  const cleaned = (raw ?? '')
    .replace(/[\u200b-\u200f\ufeff]/g, '') // 零宽字符
    .replace(/[\s\u3000]+/g, '') // 空白与全角空格
  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i)
    if (code < 0x21 || code > 0x7e) {
      return {
        key: cleaned,
        error: `API Key 第 ${i + 1} 个字符是「${cleaned[i]}」，不是英文/数字符号。请只粘贴 sk- 开头的那串密钥。`
      }
    }
  }
  return { key: cleaned }
}

function endpoint(cfg: AiConfig): string {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(base)) return base
  return `${base}/chat/completions`
}

export async function testAi(cfg: AiConfig, apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!cfg.baseUrl) return { ok: false, message: '先填写 Base URL' }
  if (!cfg.model) return { ok: false, message: '先填写模型名' }
  const { key, error } = sanitizeKey(apiKey)
  if (error) return { ok: false, message: error }
  if (!key) return { ok: false, message: '先填写 API Key' }
  try {
    const res = await fetch(endpoint(cfg), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: '只回复 OK' }],
        max_tokens: 8,
        stream: false
      })
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, message: `HTTP ${res.status}：${text.slice(0, 120)}` }
    }
    return { ok: true, message: '连接成功' }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}

/** 流式对话：每收到一段就回调，返回完整文本 */
export async function streamChat(
  cfg: AiConfig,
  apiKey: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!apiKey) throw new Error('还没有配置 API Key，请到设置里填写')
  const { key, error } = sanitizeKey(apiKey)
  if (error) throw new Error(error)
  if (!key) throw new Error('API Key 为空，请到设置里重新填写')
  const res = await fetch(endpoint(cfg), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: cfg.model, messages, stream: true, temperature: 0.5 }),
    signal
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`请求失败 HTTP ${res.status} ${text.slice(0, 200)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
        const piece = json.choices?.[0]?.delta?.content
        if (piece) {
          full += piece
          onChunk(piece)
        }
      } catch {
        // 个别服务会在流里插入非 JSON 心跳，忽略
      }
    }
  }

  return full
}
