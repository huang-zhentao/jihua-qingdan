// 当前版本回归：抽屉 / 日期 / 提前N天提醒 / 圆点 / 删除撤销 / 搜索 / 日视图
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9300
const dir = process.env.PLAN_DATA_DIR
const dataFile = join(dir, 'data.json')
const logFile = join(dir, 'logs', 'main.log')
const TITLE = '回归：带提醒的日程'
const read = () => JSON.parse(readFileSync(dataFile, 'utf8'))
const logText = () => {
  try {
    return readFileSync(logFile, 'utf8')
  } catch {
    return ''
  }
}

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
await sleep(1000)

const result = {}
const setInput = (selector, value) => `
  (() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })()
`
const setSelect = (selector, value) => `
  (() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })()
`

// 1) 点日期 → 抽屉
await ev(`
  (() => {
    const cell = [...document.querySelectorAll('.cell')].find((c) => c.querySelector('.cell-date')?.textContent === '28' && !c.classList.contains('is-out'))
    cell.click()
  })()
`)
await sleep(400)
result.drawerOpen = await ev(`document.querySelector('.drawer')?.classList.contains('is-open')`)

// 2) 标题 + 日期 10-29 + 提前 2 天提醒
await ev(setInput('.drawer-title', TITLE))
await ev(setInput('.drawer input[type="date"]', '2026-10-29'))
await ev(`
  (() => {
    const selects = document.querySelectorAll('.drawer select.dcontrol')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    setter.call(selects[1], '2')
    selects[1].dispatchEvent(new Event('change', { bubbles: true }))
  })()
`)
await sleep(200)
await ev(`document.querySelector('.drawer-actions .btn-primary').click()`)
await sleep(1000)

const created = read().tasks.find((t) => t.title === TITLE)
const remindAt = created?.remindAt ? new Date(created.remindAt) : null
result.created = Boolean(created)
result.createdDate = created?.date
result.remindDays = remindAt
  ? Math.round((new Date('2026-10-29T09:00:00').getTime() - remindAt.getTime()) / 86400000)
  : null
result.reminderScheduled = /reminders scheduled [1-9]/.test(logText())

// 3) 圆点标记完成
await ev(`
  (() => {
    const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes(${JSON.stringify(TITLE)}))
    chip?.querySelector('.chip-check')?.click()
  })()
`)
await sleep(900)
result.toggleDone = read().tasks.find((t) => t.title === TITLE)?.done

// 4) 搜索
await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))`)
await sleep(300)
await ev(setInput('.search-input', '回归'))
await sleep(300)
result.searchResults = await ev(`document.querySelectorAll('.search-item').length`)
await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
await sleep(300)

// 5) 删除 → 确认 → 撤销
await ev(`
  (() => {
    const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes(${JSON.stringify(TITLE)}))
    chip?.click()
  })()
`)
await sleep(400)
await ev(`document.querySelector('.drawer-actions .btn-delete').click()`)
await sleep(250)
result.confirmShown = await ev(`Boolean(document.querySelector('.confirm-card'))`)
await ev(`document.querySelector('.confirm-actions .btn-danger-solid').click()`)
await sleep(800)
result.tombstone = Boolean(read().tasks.find((t) => t.title === TITLE)?.deletedAt)
await ev(`document.querySelector('.toast-action').click()`)
await sleep(1500)
result.undone = !read().tasks.find((t) => t.title === TITLE)?.deletedAt

// 6) 日视图
await ev(`document.querySelectorAll('.rail-item')[1].click()`)
await sleep(500)
result.dayViewItems = await ev(`document.querySelectorAll('.agenda-item').length`)
result.miniSelected = await ev(`document.querySelector('.mini-day.is-selected .mini-num')?.textContent`)

console.log(JSON.stringify(result, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1500)
ws.close()
child.kill()
process.exit(0)
