// 月历视角截图：普通月份 + 年月选择器
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import electron from "electron"

const PORT = 9230
mkdirSync("shots", { recursive: true })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT

const child = spawn(electron, ["--no-sandbox", `--remote-debugging-port=${PORT}`, "."], { stdio: "ignore", env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
for (let i = 0; i < 40 && !page; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    page = l.find((t) => t.type === "page")
  } catch {}
  if (!page) await sleep(250)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
await new Promise((res, rej) => {
  ws.addEventListener("open", res)
  ws.addEventListener("error", rej)
})
const send = (method, params = {}) => {
  const id = ++seq
  return new Promise((r) => {
    pending.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true })
  return r.result?.result?.value
}
const shot = async (name) => {
  const r = await send("Page.captureScreenshot", { format: "png" })
  writeFileSync(join("shots", name), Buffer.from(r.result.data, "base64"))
  console.log("saved", name)
}
await send("Page.enable")
await send("Runtime.enable")
await sleep(900)

await shot("cal-oct.png")

await ev(`document.querySelector('.month-title').click()`)
await sleep(400)
await shot("cal-picker.png")

console.log(await ev(`document.querySelectorAll('.cell-badge').length`))

child.kill()
setTimeout(() => process.exit(0), 300)
