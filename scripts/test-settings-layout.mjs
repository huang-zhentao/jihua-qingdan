// 截图：设置弹窗里每个区块各自的按钮
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import electron from 'electron'

const PORT = 9395
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
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
await sleep(800)
await ev(`document.querySelector('.modal-body').scrollTop = 260`)
await sleep(300)
const shot1 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/settings-sections.png', Buffer.from(shot1.result.data, 'base64'))

const footer = await ev(`[...document.querySelectorAll('.modal-foot button')].map((b) => b.textContent.trim()).join('|')`)
const section = await ev(`[...document.querySelectorAll('.settings-section')].map((s) => s.querySelector('.settings-head span')?.textContent).join(' / ')`)
const syncBtns = await ev(`[...document.querySelectorAll('.settings-section')].find((s) => s.textContent.includes('WebDAV'))?.querySelectorAll('.ai-settings-actions .btn').length`)
const aiBtns = await ev(`[...document.querySelectorAll('.settings-section')].find((s) => s.textContent.includes('AI 分析'))?.querySelectorAll('.ai-settings-actions .btn').length`)

console.log(JSON.stringify({ footer, section, syncBtns, aiBtns }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1200)
child.kill()
process.exit(0)
