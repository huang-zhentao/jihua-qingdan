// 托盘 / 关闭行为验证（用 CDP 真正点关闭）
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const dir = process.env.PLAN_DATA_DIR
const dataFile = join(dir, 'data.json')
const logFile = join(dir, 'logs', 'main.log')
const base = JSON.parse(readFileSync(join(dir, 'data.seed.json'), 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect(port) {
  let page
  for (let i = 0; i < 40 && !page; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      page = l.find((t) => t.type === 'page')
    } catch {}
    if (!page) await sleep(250)
  }
  if (!page) throw new Error('no page')
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
  return { ev, ws }
}

async function scenario(closeToTray, port) {
  const doc = { ...base, settings: { ...base.settings, closeToTray } }
  writeFileSync(dataFile, JSON.stringify(doc, null, 2), 'utf8')

  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.SHOT
  const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${port}`, '.'], {
    stdio: 'ignore',
    env
  })

  const { ev, ws } = await connect(port)
  await sleep(1200)
  await ev('window.api.win.close()')
  await sleep(1500)

  const alive = child.exitCode === null
  const log = readFileSync(logFile, 'utf8')
  ws.close()
  if (alive) child.kill()
  await sleep(400)

  return { alive, hiddenToTray: log.includes('window hidden to tray') }
}

const a = await scenario(false, 9240)
const b = await scenario(true, 9241)

console.log(
  JSON.stringify(
    {
      baseline: a,
      closeToTray: b,
      trayCreated: readFileSync(logFile, 'utf8').includes('tray created')
    },
    null,
    2
  )
)
process.exit(0)
