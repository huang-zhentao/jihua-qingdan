// 收集箱完成热力图：按 doneAt 统计、分档、悬浮提示、点击跳转
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9450
const dir = process.env.PLAN_DATA_DIR
mkdirSync(dir, { recursive: true })

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const at = (offsetDays, hour = 10) => {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  d.setHours(hour, 0, 0, 0)
  return d
}

const makeTask = (id, offsetDays, hour = 10) => ({
  id,
  projectId: 'default',
  title: `完成于 ${iso(at(offsetDays))}`,
  date: iso(at(offsetDays)),
  done: true,
  doneAt: at(offsetDays, hour).toISOString(),
  createdAt: at(offsetDays).toISOString(),
  updatedAt: at(offsetDays).toISOString()
})

const tasks = [
  // 今天 3 条
  makeTask('t1', 0, 9),
  makeTask('t2', 0, 11),
  makeTask('t3', 0, 15),
  // 昨天 1 条
  makeTask('t4', 1),
  // 前天 5 条
  makeTask('t5', 2, 8),
  makeTask('t6', 2, 9),
  makeTask('t7', 2, 10),
  makeTask('t8', 2, 11),
  makeTask('t9', 2, 12)
]

writeFileSync(
  join(dir, 'data.json'),
  JSON.stringify({
    schemaVersion: 2,
    projects: [{ id: 'default', name: '默认', color: '#9AA4B2', sort: 0 }],
    tasks,
    settings: { view: 'month', inboxOpen: true, inboxWidth: 240, weekStart: 1 }
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
await sleep(1800)

await ev(`document.querySelector('.rail-item[aria-label="日历"]').click()`)
await sleep(800)

const info = await ev(`
  (() => {
    const cells = [...document.querySelectorAll('.heat-cell')]
    const count = (c) => cells.filter((el) => el.classList.contains(c)).length
    return {
      header: document.querySelector('.heat-sub')?.textContent ?? '',
      total: cells.length,
      lv0: count('lv0'),
      lv1: count('lv1'),
      lv2: count('lv2'),
      lv3: count('lv3'),
      lv4: count('lv4'),
      future: count('is-future'),
      weekText: document.querySelector('.heat-week')?.textContent ?? '',
      legend: document.querySelector('.heat-legend')?.textContent?.trim() ?? ''
    }
  })()
`)

// 悬浮到 lv3（今天 3 条）看提示
const tip = await ev(`
  (() => {
    const cell = document.querySelector('.heat-cell.lv3')
    if (!cell) return null
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    return new Promise((resolve) => setTimeout(() => {
      resolve(document.querySelector('.heat-tip')?.textContent ?? '')
    }, 150))
  })()
`)

// 点击 lv4（前天 5 条）跳转
const jump = await ev(`
  (() => {
    const cell = document.querySelector('.heat-cell.lv4')
    if (!cell) return null
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return new Promise((resolve) => setTimeout(() => {
      resolve(document.querySelector('.cell.is-selected .cell-date')?.textContent ?? '')
    }, 300))
  })()
`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/inbox-heatmap-live.png', Buffer.from(shot.result.data, 'base64'))
console.log(JSON.stringify({ info, tip, jump }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1000)
child.kill()
process.exit(0)
