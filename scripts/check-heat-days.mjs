import { spawn } from "node:child_process"
import electron from "electron"
const PORT = 9453
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.SHOT
const child = spawn(electron, ["--no-sandbox", "--remote-debugging-port=" + PORT, "."], { stdio: "ignore", env })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let page
for (let i = 0; i < 60 && !page; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); page = l.find(t => t.type === "page") } catch {}
  if (!page) await sleep(250)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0; const pending = new Map()
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej) })
const send = (method, params = {}) => { const id = ++seq; return new Promise(r => { pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) }) }
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.result?.value }
await send("Runtime.enable"); await send("Page.enable")
await sleep(2000)
await ev(`document.querySelector('.rail-item[aria-label="日历"]').click()`)
await sleep(800)
const res = await ev(`
  (async () => {
    const weeks = Number((document.querySelector('.heat-sub')?.textContent ?? '').match(/\\d+/)?.[0] ?? 0)
    const cells = [...document.querySelectorAll('.heat-cell')]
    const out = {}
    for (const [label, row] of [['周二(10-27)', 1], ['周三(10-28)', 2], ['周四(10-29)', 3]]) {
      const cell = cells[(weeks - 1) * 7 + row]
      cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      await new Promise(r => setTimeout(r, 120))
      out[label] = document.querySelector('.heat-tip')?.textContent ?? ''
    }
    out['本周'] = document.querySelector('.heat-week')?.textContent ?? ''
    return out
  })()
`)
console.log(JSON.stringify(res, null, 2))
ev("window.api.win.close()").catch(() => {})
await sleep(800); child.kill(); process.exit(0)
