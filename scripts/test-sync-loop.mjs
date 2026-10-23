// 验证：不会在后台无限同步；自动同步间隔可选
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import electron from 'electron'

const PORT = 9396
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT

let davLines = 0
const dav = spawn(process.execPath, ['scripts/mock-dav.mjs', '8897'], { stdio: ['ignore', 'pipe', 'ignore'] })
dav.stdout.on('data', (chunk) => {
  davLines += chunk.toString().split('\n').filter(Boolean).length
})
await new Promise((r) => setTimeout(r, 600))

const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
await send('Page.enable')
await sleep(1500)

// 配置同步
await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
await sleep(700)
await ev(`
  (() => {
    const section = [...document.querySelectorAll('.settings-section')].find((s) => s.textContent.includes('WebDAV'))
    const inputs = section.querySelectorAll('input.input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(inputs[0], 'http://127.0.0.1:8897/'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(inputs[1], 'u'); inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(inputs[2], 'p'); inputs[2].dispatchEvent(new Event('input', { bubbles: true }))
  })()
`)
await sleep(200)
await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('保存并同步')).click()`)
await sleep(3000)

const intervalValue = await ev(`
  (() => {
    const section = [...document.querySelectorAll('.settings-section')].find((s) => s.textContent.includes('WebDAV'))
    return section.querySelector('select.input-sm')?.value ?? 'none'
  })()
`)

await ev(`document.querySelector('.modal-head .icon-btn').click()`)
await sleep(1500)

const baseline = davLines
await sleep(30000)
const after = davLines

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/sync-loop.png', Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify({ intervalValue, requestsDuringConfig: baseline, requestsDuringIdle30s: after - baseline }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1200)
child.kill()
dav.kill()
process.exit(0)
