// AI 流式输出端到端验证（对接本地 mock 服务，不消耗真实额度）
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9330
mkdirSync('shots', { recursive: true })
const dir = process.env.PLAN_DATA_DIR

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT

const dav = spawn(process.execPath, ['scripts/mock-ai.mjs'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 600))

const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let page
for (let i = 0; i < 50 && !page; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    page = l.find((t) => t.type === 'page')
  } catch {
    /* ignore */
  }
  if (!page) await sleep(250)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})
const send = (method, params = {}) => {
  const id = ++seq
  return new Promise((r) => {
    pending.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
await send('Runtime.enable')
await send('Page.enable')
await sleep(1000)

const setInput = (selector, value) => `
  (() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })()
`

// 1) 打开设置，配置 AI（按 AI 区块内的输入框顺序取，避免 placeholder 变化导致找不到）
await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
await sleep(600)
await ev(`
  (() => {
    const section = [...document.querySelectorAll('.settings-section')].find((s) => s.textContent.includes('AI 分析'))
    const inputs = section.querySelectorAll('input.input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(inputs[0], 'http://127.0.0.1:8899/v1')
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(inputs[1], 'mock-model')
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(inputs[2], 'sk-test')
    inputs[2].dispatchEvent(new Event('input', { bubbles: true }))
    return inputs.length
  })()
`)
await ev(`[...document.querySelectorAll('.ai-settings-actions .btn')].find((b) => b.textContent.includes('保存')).click()`)
await sleep(800)
const savedMsg = await ev(`document.querySelector('.ai-settings-actions .settings-message')?.textContent ?? ''`)
await ev(`document.querySelector('.modal-body').scrollTop = 9999`)
await sleep(200)
const shotSettings = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join('shots', 'ai-settings.png'), Buffer.from(shotSettings.result.data, 'base64'))
await ev(`document.querySelector('.modal-head .icon-btn').click()`)
await sleep(300)

// 2) 进入 AI 视图，生成
await ev(`document.querySelector('.rail-item[aria-label="AI 分析"]').click()`)
await sleep(600)
await ev(`[...document.querySelectorAll('.btn')].find((b) => b.textContent.includes('开始分析')).click()`)
await sleep(2500)

const text = await ev(`document.querySelector('.ai-markdown')?.textContent ?? ''`)
const headings = await ev(`document.querySelectorAll('.ai-markdown .ai-h').length`)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join('shots', 'ai-view.png'), Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify({ savedMsg, hasText: text.length > 10, headings, preview: text.slice(0, 40) }, null, 2))

ev('window.api.win.close()').catch(() => {})
await sleep(1200)
ws.close()
child.kill()
dav.kill()
process.exit(0)
