// 编辑态抽屉 + 删除确认弹窗截图
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9227
mkdirSync('shots', { recursive: true })

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
  writeFileSync(join('shots', name), Buffer.from(res.result.data, 'base64'))
  console.log('saved', name)
}

await send('Page.enable')
await send('Runtime.enable')
await sleep(900)

// 打开一条已有日程（编辑态，顶部应有删除）
await evaluate(`document.querySelector('.chip').click()`)
await sleep(500)
await shot('m3-drawer-edit.png')

// 删除确认
await evaluate(`document.querySelector('.drawer-actions .btn-delete').click()`)
await sleep(350)
await shot('m3-confirm.png')

child.kill()
setTimeout(() => process.exit(0), 300)
