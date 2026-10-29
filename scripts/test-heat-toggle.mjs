import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import electron from "electron"
const PORT = 9455
const dir = process.env.PLAN_DATA_DIR
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
await sleep(700)
const before = await ev(`Boolean(document.querySelector('.inbox-heat'))`)
await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
await sleep(700)
const toggled = await ev(`
  (() => {
    const row = [...document.querySelectorAll('.toggle-row')].find((r) => r.textContent.includes('完成热力图'))
    if (!row) return 'no-row'
    row.querySelector('input[type=checkbox]').click()
    return 'ok'
  })()
`)
await sleep(600)
await ev(`document.querySelector('.modal-head .icon-btn').click()`)
await sleep(700)
const after = await ev(`Boolean(document.querySelector('.inbox-heat'))`)
await sleep(1200)
const saved = JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8')).settings.showHeatmap
console.log(JSON.stringify({ before, toggled, after, saved }, null, 2))
ev("window.api.win.close()").catch(() => {})
await sleep(800); child.kill(); process.exit(0)
