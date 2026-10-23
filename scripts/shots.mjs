// 逐个打开 M2 的界面状态，用 CDP 截图
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9224
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

// 1. 新建日程弹窗
await evaluate(`document.querySelector('.tb-btn[aria-label="新建日程"]').click()`)
await sleep(400)
await evaluate(`
  (() => {
    const input = document.querySelector('.input-title')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '整理本周实验数据，输出对比表')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
  })()
`)
await sleep(200)
await shot('m2-task-dialog.png')

// 2. 项目管理
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
await sleep(250)
await evaluate(`document.querySelector('.filter-btn').click()`)
await sleep(250)
await evaluate(`[...document.querySelectorAll('.filter-item')].find((b) => b.textContent.includes('管理项目')).click()`)
await sleep(450)
await shot('m2-projects.png')

// 3. 折叠浮层
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
await sleep(250)
await evaluate(`document.querySelector('.cell-more')?.click()`)
await sleep(450)
await shot('m2-peek.png')

child.kill()
setTimeout(() => process.exit(0), 300)
