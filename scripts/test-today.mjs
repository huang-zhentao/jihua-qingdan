// 验证「今」按钮：切到别的月份 → 点今 → 回到当前月并选中今天
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import electron from 'electron'

const PORT = 9372
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

await ev(`document.querySelector('.rail-item[aria-label="日历"]').click()`)
await sleep(600)

const start = await ev(`document.querySelector('.month-title')?.textContent ?? 'none'`)

const clickByLabel = (label) =>
  ev(`[...document.querySelectorAll('.tb-btn')].find((b) => b.getAttribute('aria-label') === '${label}')?.click()`)

await clickByLabel('下个月')
await clickByLabel('下个月')
await sleep(400)
const moved = await ev(`document.querySelector('.month-title')?.textContent ?? 'none'`)

await ev(`[...document.querySelectorAll('.tb-btn')].find((b) => b.textContent.trim() === '今')?.click()`)
await sleep(500)

const back = await ev(`document.querySelector('.month-title')?.textContent ?? 'none'`)
const selected = await ev(`document.querySelector('.cell.is-selected .cell-date')?.textContent ?? 'none'`)
const todayCell = await ev(`document.querySelector('.cell.is-today .cell-date')?.textContent ?? 'none'`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/today-btn.png', Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify({ start, moved, back, selected, todayCell }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1200)
child.kill()
process.exit(0)
