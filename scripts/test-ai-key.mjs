// 校验 API Key 清洗：含中文时报可读错误；纯 ASCII 时正常
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import electron from 'electron'

const PORT = 9380
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
await sleep(1500)

await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
await sleep(700)

const setKey = (value) => ev(`
  (() => {
    const section = [...document.querySelectorAll('.settings-section')].find((s) => s.textContent.includes('AI 分析'))
    const inputs = section.querySelectorAll('input.input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(inputs[2], ${JSON.stringify(value)})
    inputs[2].dispatchEvent(new Event('input', { bubbles: true }))
  })()
`)

const clickTest = () =>
  ev(`[...document.querySelectorAll('.ai-settings-actions .btn')].find((b) => b.textContent.includes('测试连接')).click()`)

const readMsg = async () => ev(`document.querySelector('.ai-settings-actions .settings-message')?.textContent ?? ''`)

await setKey('sk-abc至def')
await clickTest()
await sleep(1200)
const badMsg = await readMsg()
await ev(`document.querySelector('.modal-body').scrollTop = 9999`)
await sleep(300)
const shotBad = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/ai-key-error.png', Buffer.from(shotBad.result.data, 'base64'))

await setKey('  sk-test-123  ')
await clickTest()
await sleep(1500)
const goodMsg = await readMsg()

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/ai-key-ok.png', Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify({ badMsg, goodMsg }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1200)
child.kill()
mock.kill()
process.exit(0)
