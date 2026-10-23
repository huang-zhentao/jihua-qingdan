// 搜索 + 深色模式截图
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import electron from "electron"

const PORT = 9242
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

// Ctrl+K 打开搜索并输入
await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))`)
await sleep(350)
await ev(`
  (() => {
    const input = document.querySelector('.search-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '测试')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()
`)
await sleep(350)
console.log("results:", await ev(`document.querySelectorAll('.search-item').length`))
await shot("search.png")

await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
await sleep(300)

// 切成深色
await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
await sleep(400)
await ev(`[...document.querySelectorAll('.seg-btn')].find((b) => b.textContent === '深色').click()`)
await sleep(400)
await ev(`document.querySelector('.modal-head .icon-btn').click()`)
await sleep(500)
await shot("dark.png")

child.kill()
setTimeout(() => process.exit(0), 300)
