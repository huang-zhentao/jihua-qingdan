// 验证：主页右上角同步按钮 + lastSyncAt 落盘
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9390
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const dav = spawn(process.execPath, ['scripts/mock-dav.mjs', '8898'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 600))

const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const dataFile = join(process.env.PLAN_DATA_DIR, 'data.json')
const read = () => JSON.parse(readFileSync(dataFile, 'utf8'))

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

// 打开设置，填同步信息
await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
await sleep(700)
await ev(`
  (() => {
    const section = [...document.querySelectorAll('.settings-section')].find((s) => s.textContent.includes('WebDAV'))
    const inputs = section.querySelectorAll('input.input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(inputs[0], 'http://127.0.0.1:8898/')
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(inputs[1], 'u')
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(inputs[2], 'p')
    inputs[2].dispatchEvent(new Event('input', { bubbles: true }))
  })()
`)
await sleep(300)
await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('保存并同步')).click()`)
await sleep(3000)
const syncedOnce = Boolean(read().settings.lastSyncAt)
await ev(`document.querySelector('.modal-head .icon-btn').click()`)
await sleep(400)

// 点工具栏同步按钮
await ev(`document.querySelector('.rail-item[aria-label="日历"]').click()`)
await sleep(600)
const hasSyncBtn = await ev(`Boolean(document.querySelector('.tb-sync'))`)
await ev(`document.querySelector('.tb-sync').click()`)
await sleep(2500)
const toast = await ev(`document.querySelector('.toast-text')?.textContent ?? ''`)
const shot = await send('Page.captureScreenshot', { format: 'png' })
const { writeFileSync } = await import('node:fs')
writeFileSync('shots/sync-button.png', Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify({ hasSyncBtn, syncedOnce, toast, lastSyncAt: read().settings.lastSyncAt ?? null }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1200)
child.kill()
dav.kill()
process.exit(0)
