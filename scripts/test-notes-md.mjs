// 验证备注：高度变大 + Markdown 预览
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import electron from 'electron'

const PORT = 9405
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

await ev(`document.querySelector('.rail-item[aria-label="日历"]').click()`)
await sleep(400)
await ev(`document.querySelector('.chip')?.click()`)
await sleep(600)

const md = '## 进展\n- 完成 **PCB 打样** 确认\n- 待办：`焊接` 与测试\n\n1. 周一联系厂家\n2. 周三复测'

const height = await ev(`
  (() => {
    const el = document.querySelector('.dnotes')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(md)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return Math.round(el.getBoundingClientRect().height)
  })()
`)
await sleep(400)
await ev(`document.querySelector('.dnotes-toggle')?.click()`)
await sleep(400)

const rendered = await ev(`
  (() => {
    const box = document.querySelector('.dnotes-preview')
    return box ? {
      headings: box.querySelectorAll('.md-h').length,
      items: box.querySelectorAll('.md-list li').length,
      strong: box.querySelectorAll('strong').length,
      code: box.querySelectorAll('code').length
    } : null
  })()
`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/notes-markdown.png', Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify({ textareaHeight: height, rendered }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1000)
child.kill()
process.exit(0)
