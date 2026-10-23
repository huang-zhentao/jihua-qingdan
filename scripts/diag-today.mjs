import { spawn } from "node:child_process"
import electron from "electron"
const PORT = 9371
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.SHOT
const child = spawn(electron, ["--no-sandbox", "--remote-debugging-port=" + PORT, "."], { stdio: ["ignore","pipe","pipe"], env })
child.stderr.on("data", d => console.log("ERR:", d.toString().slice(0,300)))
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let page
for (let i = 0; i < 40 && !page; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); page = l.find(t => t.type === "page") } catch {}
  if (!page) await sleep(300)
}
console.log("page:", page ? page.url : "none")
if (!page) { child.kill(); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0; const pending = new Map()
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej) })
const send = (method, params = {}) => { const id = ++seq; return new Promise(r => { pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) }) }
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); return JSON.stringify(r.result) }
await send("Runtime.enable")
await sleep(3000)
console.log("url+len:", await ev(`location.href + " | " + document.body.innerHTML.length`))
console.log("month:", await ev(`document.querySelector('.month-title')?.textContent ?? 'none'`))
console.log("btns:", await ev(`[...document.querySelectorAll('.tb-btn')].map(b => b.getAttribute('aria-label') || b.textContent).join(',')`))
child.kill(); process.exit(0)
