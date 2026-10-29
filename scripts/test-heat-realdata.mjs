// 用真实数据核对热力图数字
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import electron from 'electron'

const PORT = 9452
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
await sleep(2000)

await ev(`document.querySelector('.rail-item[aria-label="日历"]').click()`)
await sleep(900)

const header = await ev(`document.querySelector('.heat-sub')?.textContent ?? ''`)
const nonEmpty = await ev(`
  (() => {
    const cells = [...document.querySelectorAll('.heat-cell')]
    return cells.filter((c) => !c.classList.contains('lv0') && !c.classList.contains('is-future')).length
  })()
`)
const weekText = await ev(`document.querySelector('.heat-week')?.textContent ?? ''`)

// 本周一（10-26）那格：最后一列第 0 行
const tipMon = await ev(`
  (() => {
    const weeks = Number((document.querySelector('.heat-sub')?.textContent ?? '').match(/\\d+/)?.[0] ?? 0)
    const cells = [...document.querySelectorAll('.heat-cell')]
    const cell = cells[(weeks - 1) * 7 + 0]
    if (!cell) return 'no-cell'
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    return new Promise((r) => setTimeout(() => r(document.querySelector('.heat-tip')?.textContent ?? ''), 150))
  })()
`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/heat-realdata.png', Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify({ header, nonEmpty, weekText, tipMon }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1000)
child.kill()
process.exit(0)
