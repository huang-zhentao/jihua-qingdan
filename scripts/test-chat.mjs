// AI 对话多轮验证（本地 mock 服务）
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9350
mkdirSync('shots', { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT

const mock = spawn(process.execPath, ['scripts/mock-ai.mjs'], { stdio: 'ignore' })
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
await sleep(1200)

await ev(`document.querySelector('.rail-item[aria-label="AI 分析"]').click()`)
await sleep(600)

// 第一轮：点快捷提问
await ev(`document.querySelector('.ai-quick-btn').click()`)
await sleep(2600)
const first = await ev(`document.querySelectorAll('.ai-msg').length`)
const firstText = await ev(`document.querySelector('.ai-msg.assistant .ai-bubble')?.textContent ?? ''`)

// 第二轮：手动输入 + Enter
await ev(`
  (() => {
    const input = document.querySelector('.ai-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(input, '那我下周先做什么？')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })()
`)
await sleep(2600)
const second = await ev(`document.querySelectorAll('.ai-msg').length`)
const lastText = await ev(`[...document.querySelectorAll('.ai-msg.assistant .ai-bubble')].pop()?.textContent ?? ''`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join('shots', 'ai-chat.png'), Buffer.from(shot.result.data, 'base64'))

console.log(
  JSON.stringify(
    {
      firstRoundMessages: first,
      firstReply: firstText.slice(0, 30),
      secondRoundMessages: second,
      lastReply: lastText.slice(0, 30)
    },
    null,
    2
  )
)

ev('window.api.win.close()').catch(() => {})
await sleep(1200)
ws.close()
child.kill()
mock.kill()
process.exit(0)
