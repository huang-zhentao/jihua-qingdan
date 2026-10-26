// 收集箱折叠箭头：展开 → 收起 → 箭头显示数量
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import electron from 'electron'

const PORT = 9422
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
await sleep(1600)

await ev(`document.querySelector('.rail-item[aria-label="日历"]').click()`)
await sleep(600)

// 记三条
for (const title of ['整理本周实验数据', '联系厂家确认打样进度', '买焊台烙铁头']) {
  await ev(`
    (() => {
      const input = document.querySelector('.inbox-input')
      if (!input) return
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, ${JSON.stringify(title)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })()
  `)
  await sleep(400)
}

const railHasInbox = await ev(`Boolean(document.querySelector('.rail-item[aria-label="收集箱"]'))`)
const visibleOpen = await ev(`Boolean(document.querySelector('.inbox'))`)

// 收起
await ev(`document.querySelector('.inbox-collapse')?.click()`)
await sleep(500)
const afterCollapse = await ev(`Boolean(document.querySelector('.inbox'))`)
const handleCount = await ev(`document.querySelector('.inbox-handle-count')?.textContent ?? ''`)
const shot1 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/inbox-collapsed.png', Buffer.from(shot1.result.data, 'base64'))

// 展开
await ev(`document.querySelector('.inbox-handle')?.click()`)
await sleep(500)
const afterExpand = await ev(`Boolean(document.querySelector('.inbox'))`)
const shot2 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/inbox-expanded.png', Buffer.from(shot2.result.data, 'base64'))

console.log(
  JSON.stringify({ railHasInbox, visibleOpen, afterCollapse, handleCount, afterExpand }, null, 2)
)
ev('window.api.win.close()').catch(() => {})
await sleep(1000)
child.kill()
process.exit(0)
