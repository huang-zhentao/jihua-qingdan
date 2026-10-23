// 圆点勾选 + 随机背景色验证
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9243
const dir = process.env.PLAN_DATA_DIR
const dataFile = join(dir, 'data.json')
const read = () => JSON.parse(readFileSync(dataFile, 'utf8'))

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let page
for (let i = 0; i < 40 && !page; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    page = l.find((t) => t.type === 'page')
  } catch {}
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
  return r.result?.result?.value
}
await send('Runtime.enable')
await sleep(900)

const result = {}

// 新建：点 28 号
await ev(`
  (() => {
    const cell = [...document.querySelectorAll('.cell')].find((c) => c.querySelector('.cell-date')?.textContent === '28' && !c.classList.contains('is-out'))
    cell.click()
  })()
`)
await sleep(400)
result.newTaskRandomColor = await ev(`document.querySelector('.color-choice.is-active')?.style.background ?? ''`)
result.dotExists = await ev(`Boolean(document.querySelector('.title-dot'))`)

// 点圆点标记完成
await ev(`document.querySelector('.title-dot').click()`)
await sleep(200)
result.dotDone = await ev(`document.querySelector('.title-dot').classList.contains('is-done')`)

// 填标题保存
await ev(`
  (() => {
    const input = document.querySelector('.drawer-title')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '圆点勾选测试')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()
`)
await ev(`document.querySelector('.drawer-actions .btn-primary').click()`)
await sleep(900)

const created = read().tasks.find((t) => t.title === '圆点勾选测试')
result.createdDone = created?.done
result.createdColor = created?.color

// 打开一个已有任务，点圆点取消完成
await ev(`document.querySelector('.chip').click()`)
await sleep(400)
const before = await ev(`document.querySelector('.title-dot').classList.contains('is-done')`)
await ev(`document.querySelector('.title-dot').click()`)
await sleep(800)
result.toggleExisting = { before, after: await ev(`document.querySelector('.title-dot').classList.contains('is-done')`) }

console.log(JSON.stringify(result, null, 2))
child.kill()
setTimeout(() => process.exit(0), 300)
