// 收集箱外观：多个条目 + 抽屉里的「在收集箱」状态
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import electron from 'electron'

const PORT = 9421
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

// 连加三条
for (const title of ['联系厂家确认打样进度', '整理本周实验数据', '买新的焊台烙铁头']) {
  await ev(`
    (() => {
      const input = document.querySelector('.inbox-input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, ${JSON.stringify(title)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })()
  `)
  await sleep(500)
}

const shot1 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/inbox-open.png', Buffer.from(shot1.result.data, 'base64'))

// 打开抽屉看日期行
await ev(`document.querySelector('.inbox-item')?.click()`)
await sleep(700)
const dateValue = await ev(`document.querySelector('.ddate')?.value ?? 'none'`)
const dateBtn = await ev(`document.querySelector('.ddate-inbox')?.textContent ?? ''`)
const remindDisabled = await ev(`document.querySelector('.drow.is-muted select')?.disabled ?? null`)
const shot2 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/inbox-drawer.png', Buffer.from(shot2.result.data, 'base64'))

console.log(JSON.stringify({ dateValue, dateBtn, remindDisabled }, null, 2))
ev('window.api.win.close()').catch(() => {})
await sleep(1000)
child.kill()
process.exit(0)
