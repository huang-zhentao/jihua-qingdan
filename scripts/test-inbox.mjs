// 收集箱端到端：新建 → 拖到日历 → 拖回收集箱 → 折叠
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9420
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const read = () => JSON.parse(readFileSync(join(process.env.PLAN_DATA_DIR, 'data.json'), 'utf8'))

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
await sleep(1500)

await ev(`document.querySelector('.rail-item[aria-label="日历"]').click()`)
await sleep(500)

const hasPanel = await ev(`Boolean(document.querySelector('.inbox'))`)
const panelWidth = await ev(`Math.round(document.querySelector('.inbox')?.getBoundingClientRect().width ?? 0)`)

// 快速添加一条
await ev(`
  (() => {
    const input = document.querySelector('.inbox-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '收集箱测试任务')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })()
`)
await sleep(1200)

const afterAdd = read().tasks.find((t) => t.title === '收集箱测试任务')
const inboxCount = await ev(`document.querySelectorAll('.inbox-item').length`)

// 拖到日历某天（模拟 HTML5 拖放）
const dropDate = await ev(`
  (() => {
    const item = document.querySelector('.inbox-item')
    const cells = [...document.querySelectorAll('.cell')].filter((c) => !c.classList.contains('is-out') && !c.classList.contains('is-today'))
    const target = cells[5]
    const dt = new DataTransfer()
    item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    item.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
    return target.querySelector('.cell-date')?.textContent ?? ''
  })()
`)
await sleep(1200)
const afterDrop = read().tasks.find((t) => t.title === '收集箱测试任务')
const toast1 = await ev(`document.querySelector('.toast-text')?.textContent ?? ''`)

// 从日历拖回收集箱
const backResult = await ev(`
  (() => {
    const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent.includes('收集箱测试任务'))
    const list = document.querySelector('.inbox-list')
    if (!chip || !list) return 'missing'
    const dt = new DataTransfer()
    chip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    list.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    list.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    return 'ok'
  })()
`)
await sleep(1200)
const afterBack = read().tasks.find((t) => t.title === '收集箱测试任务')

// 折叠
await ev(`document.querySelector('.rail-item[aria-label="收集箱"]').click()`)
await sleep(600)
const collapsed = await ev(`!document.querySelector('.inbox')`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/inbox.png', Buffer.from(shot.result.data, 'base64'))

console.log(
  JSON.stringify(
    {
      hasPanel,
      panelWidth,
      afterAddDate: afterAdd?.date ?? null,
      inboxCount,
      dropDate,
      afterDropDate: afterDrop?.date ?? null,
      toast1,
      backResult,
      afterBackDate: afterBack?.date ?? null,
      collapsed
    },
    null,
    2
  )
)
ev('window.api.win.close()').catch(() => {})
await sleep(1200)
child.kill()
process.exit(0)
