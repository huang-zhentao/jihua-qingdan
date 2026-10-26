// 验证：分界可拖宽 + 长标题换行
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9433
const dir = process.env.PLAN_DATA_DIR
mkdirSync(dir, { recursive: true })
writeFileSync(
  join(dir, 'data.json'),
  JSON.stringify({
    schemaVersion: 2,
    projects: [{ id: 'default', name: '默认', color: '#9AA4B2', sort: 0 }],
    tasks: [],
    settings: { view: 'month', inboxOpen: true, inboxWidth: 240 }
  })
)

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let page
for (let i = 0; i < 60 && !page; i++) {
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
await sleep(1600)

await ev(`document.querySelector('.rail-item[aria-label="日历"]').click()`)
await sleep(600)

const widthBefore = await ev(`Math.round(document.querySelector('.inbox').getBoundingClientRect().width)`)

// 拖动分界 +100px
const dragResult = await ev(`
  (() => {
    const handle = document.querySelector('.inbox-resizer')
    if (!handle) return 'no-handle'
    const rect = handle.getBoundingClientRect()
    const startX = rect.left + 2
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX, clientY: rect.top + 100 }))
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: startX + 100, clientY: rect.top + 100 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: startX + 100, clientY: rect.top + 100 }))
    return 'ok'
  })()
`)
await sleep(800)
const widthAfter = await ev(`Math.round(document.querySelector('.inbox').getBoundingClientRect().width)`)

// 加一条超长标题
await ev(`
  (() => {
    const input = document.querySelector('.inbox-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '把这一周所有采集到的数据重新整理一遍并且写一份完整的实验报告发给导师确认')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })()
`)
await sleep(900)

const wrap = await ev(`
  (() => {
    const item = document.querySelector('.inbox-item')
    const title = item?.querySelector('.inbox-item-title')
    if (!item || !title) return null
    const cs = getComputedStyle(title)
    return {
      itemHeight: Math.round(item.getBoundingClientRect().height),
      titleHeight: Math.round(title.getBoundingClientRect().height),
      whiteSpace: cs.whiteSpace,
      overflow: cs.overflow,
      textOverflow: cs.textOverflow
    }
  })()
`)

await sleep(1200)
const saved = JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8')).settings.inboxWidth

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/inbox-resized.png', Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify({ widthBefore, dragResult, widthAfter, savedWidth: saved, wrap }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1000)
child.kill()
process.exit(0)
