// 迷你日历灰点 + 过去提醒不排程 + 项目墓碑
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9320
const dir = process.env.PLAN_DATA_DIR
const dataFile = join(dir, 'data.json')
const logFile = join(dir, 'logs', 'main.log')
const read = () => JSON.parse(readFileSync(dataFile, 'utf8'))
const logText = () => {
  try {
    return readFileSync(logFile, 'utf8')
  } catch {
    return ''
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })

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

// 1) 日视图灰点
await ev(`document.querySelectorAll('.rail-item')[1].click()`)
await sleep(600)
result.miniDots = await ev(`document.querySelectorAll('.mini-dot').length`)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join('shots', 'dayview-dots.png'), Buffer.from(shot.result.data, 'base64'))

// 2) 回月视图，建一条「今天 + 提前1天」的日程（提醒时间已过去）
await ev(`document.querySelectorAll('.rail-item')[0].click()`)
await sleep(500)
await ev(`
  (() => {
    const cell = [...document.querySelectorAll('.cell')].find((c) => c.classList.contains('is-today'))
    cell.click()
  })()
`)
await sleep(400)
await ev(`
  (() => {
    const input = document.querySelector('.drawer-title')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '过去的提醒测试')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const selects = document.querySelectorAll('.drawer select.dcontrol')
    const ssetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    ssetter.call(selects[1], '1')
    selects[1].dispatchEvent(new Event('change', { bubbles: true }))
  })()
`)
await ev(`document.querySelector('.drawer-actions .btn-primary').click()`)
await sleep(1200)
result.pastReminderSaved = Boolean(read().tasks.find((t) => t.title === '过去的提醒测试')?.remindAt)
const log = logText()
result.lastScheduleLine = (log.match(/reminders scheduled \d+/g) ?? []).slice(-1)[0] ?? ''

// 3) 删除项目「购物」，检查墓碑
await ev(`document.querySelector('.filter-btn').click()`)
await sleep(250)
await ev(`[...document.querySelectorAll('.filter-item')].find((b) => b.textContent.includes('管理项目')).click()`)
await sleep(400)
await ev(`
  (() => {
    const rows = [...document.querySelectorAll('.project-row')]
    const row = rows.find((r) => r.querySelector('input.input-flat')?.value === '购物')
    row.querySelector('.icon-btn-danger').click()
  })()
`)
await sleep(300)
await ev(`document.querySelector('.inline-confirm .btn-danger').click()`)
await sleep(600)
const shopping = read().projects.find((p) => p.name === '购物')
result.projectTombstone = Boolean(shopping?.deletedAt)
result.projectHidden = await ev(`!document.querySelector('.filter-menu')?.textContent.includes('购物')`)

console.log(JSON.stringify(result, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1500)
ws.close()
child.kill()
process.exit(0)
