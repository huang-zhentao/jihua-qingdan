// M3：抽屉 + 日详情截图
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9225
const outDir = 'shots'
mkdirSync(outDir, { recursive: true })

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT

const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* ignore */
    }
    await sleep(250)
  }
  throw new Error('devtools not ready')
}

const page = await getPage()
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})

const send = (method, params = {}) => {
  const id = ++seq
  return new Promise((resolve) => {
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return res.result?.result?.value
}

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, name), Buffer.from(res.result.data, 'base64'))
  console.log('saved', name)
}

await send('Page.enable')
await send('Runtime.enable')
await sleep(900)

// 1) 点 10/23 这一天 → 抽屉
const opened = await evaluate(`
  (() => {
    const cells = [...document.querySelectorAll('.cell')]
    const cell = cells.find((c) => c.querySelector('.cell-date')?.textContent === '23')
    if (!cell) return false
    cell.click()
    return true
  })()
`)
await sleep(500)
await evaluate(`
  (() => {
    const input = document.querySelector('.drawer-title')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '整理本周实验数据')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
  })()
`)
await sleep(200)
await shot('m3-drawer.png')

// 2) 关抽屉，切日详情
await evaluate(`document.querySelector('.drawer-head .icon-btn').click()`)
await sleep(350)
await evaluate(`document.querySelectorAll('.rail-item')[1].click()`)
await sleep(500)
await shot('m3-dayview.png')

console.log(JSON.stringify({ opened }))
child.kill()
setTimeout(() => process.exit(0), 300)
