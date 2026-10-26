// 验证：从日历拖回收集箱后，条目样式与新增一致（不应残留半透明拖拽态）
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9425
const dir = process.env.PLAN_DATA_DIR
mkdirSync(dir, { recursive: true })
const today = new Date()
const pad = (n) => String(n).padStart(2, '0')
const key = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
writeFileSync(
  join(dir, 'data.json'),
  JSON.stringify({
    schemaVersion: 2,
    projects: [{ id: 'default', name: '默认', color: '#9AA4B2', sort: 0 }],
    tasks: [
      {
        id: 't1',
        projectId: 'default',
        title: '从日历拖回去的任务',
        date: key,
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    settings: { view: 'month' }
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

const before = await ev(`document.querySelectorAll('.chip').length`)

const dropResult = await ev(`
  (() => {
    const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes('从日历拖回去的任务'))
    const list = document.querySelector('.inbox-list')
    if (!chip || !list) return 'missing'
    const dt = new DataTransfer()
    chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    list.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    list.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    return 'ok'
  })()
`)
await sleep(1200)

const after = await ev(`
  (() => {
    const item = [...document.querySelectorAll('.inbox-item')].find((el) => el.textContent.includes('从日历拖回去的任务'))
    if (!item) return null
    const cs = getComputedStyle(item)
    return {
      hasDraggingClass: item.classList.contains('is-dragging'),
      opacity: cs.opacity,
      titleColor: getComputedStyle(item.querySelector('.inbox-item-title')).color,
      dot: Boolean(item.querySelector('.inbox-dot'))
    }
  })()
`)

// 再新增一条做对比
await ev(`
  (() => {
    const input = document.querySelector('.inbox-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '新加的任务')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })()
`)
await sleep(900)
const fresh = await ev(`
  (() => {
    const item = [...document.querySelectorAll('.inbox-item')].find((el) => el.textContent.includes('新加的任务'))
    if (!item) return null
    const cs = getComputedStyle(item)
    return {
      hasDraggingClass: item.classList.contains('is-dragging'),
      opacity: cs.opacity,
      titleColor: getComputedStyle(item.querySelector('.inbox-item-title')).color,
      dot: Boolean(item.querySelector('.inbox-dot'))
    }
  })()
`)

console.log(JSON.stringify({ chipsBefore: before, dropResult, after, fresh }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1000)
child.kill()
process.exit(0)
