// 托盘隐藏的真实性验证：关闭后窗口是否隐藏、进程是否存活、再次启动能否唤回
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9351
const dir = process.env.PLAN_DATA_DIR
const logFile = join(dir, 'logs', 'main.log')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = () => {
  try {
    return readFileSync(logFile, 'utf8')
  } catch {
    return ''
  }
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT

const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })

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
  return r.result?.result?.value
}
await send('Runtime.enable')
await sleep(1500)

const before = await ev(`document.visibilityState`)
await ev('window.api.win.close()').catch(() => {})
await sleep(2000)
const hiddenState = await ev(`document.visibilityState`)
const aliveAfterClose = child.exitCode === null
const hiddenLogged = log().includes('window hidden to tray')

// 再启动一个实例，单实例逻辑应该把旧窗口唤回来
const second = spawn(electron, ['--no-sandbox', '.'], { stdio: 'ignore', env })
await sleep(3000)
const afterSecond = await ev(`document.visibilityState`)
const secondExited = second.exitCode !== null
if (second.exitCode === null) second.kill()

console.log(
  JSON.stringify(
    {
      before,
      hiddenState,
      aliveAfterClose,
      hiddenLogged,
      afterSecondLaunch: afterSecond,
      secondInstanceExited: secondExited
    },
    null,
    2
  )
)

child.kill()
process.exit(0)
