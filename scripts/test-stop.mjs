import { spawn } from "node:child_process"
import electron from "electron"
const PORT = 9352
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const mockEnv = { ...process.env, MOCK_DELAY: "500", MOCK_CHUNKS: "20" }
const mock = spawn(process.execPath, ["scripts/mock-ai.mjs"], { stdio: "ignore", env: mockEnv })
await sleep(600)
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.SHOT
const child = spawn(electron, ["--no-sandbox", "--remote-debugging-port=" + PORT, "."], { stdio: "ignore", env })
let page
for (let i = 0; i < 50 && !page; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); page = l.find(t => t.type === "page") } catch {}
  if (!page) await sleep(250)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0; const pending = new Map()
ws.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej) })
const send = (method, params = {}) => { const id = ++seq; return new Promise(r => { pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) }) }
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.result?.value }
await send("Runtime.enable")
await sleep(1200)
await ev(`document.querySelector('.rail-item[aria-label="AI 分析"]').click()`)
await sleep(500)
await ev(`document.querySelector('.ai-quick-btn').click()`)
await sleep(1500)
const midText = await ev(`document.querySelector('.ai-msg.assistant .ai-bubble')?.textContent ?? ''`)
const stopVisible = await ev(`Boolean(document.querySelector('.ai-send.is-stop'))`)
await ev(`document.querySelector('.ai-send.is-stop').click()`)
await sleep(800)
const finalText = await ev(`document.querySelector('.ai-msg.assistant .ai-bubble')?.textContent ?? ''`)
const stillRunning = await ev(`Boolean(document.querySelector('.ai-send.is-stop'))`)
console.log(JSON.stringify({ midLen: midText.length, stopVisible, finalLen: finalText.length, stopped: !stillRunning }, null, 2))
child.kill(); mock.kill(); process.exit(0)
