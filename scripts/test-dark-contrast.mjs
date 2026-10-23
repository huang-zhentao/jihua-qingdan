// 检查暗色主题下按钮与标签的实际颜色
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import electron from 'electron'

const PORT = 9410
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
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

// 切到深色
await ev(`document.documentElement.classList.add('theme-dark')`)
await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
await sleep(700)

const info = await ev(`
  (() => {
    const pick = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return { color: cs.color, bg: cs.backgroundColor, border: cs.borderColor }
    }
    return {
      btn: pick('.modal-foot .btn'),
      toggleLabel: pick('.toggle-label'),
      hint: pick('.settings-hint'),
      footnote: pick('.settings-footnote'),
      fieldLabel: pick('.field-label'),
      modal: pick('.modal')
    }
  })()
`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/dark-settings.png', Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify(info, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1000)
child.kill()
process.exit(0)
