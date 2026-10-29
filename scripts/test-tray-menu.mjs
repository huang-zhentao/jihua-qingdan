// 托盘弹窗：只有圆圈能完成任务，点标题打开任务
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9440
const dir = process.env.PLAN_DATA_DIR
mkdirSync(dir, { recursive: true })

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const stamp = new Date().toISOString()

writeFileSync(
  join(dir, 'data.json'),
  JSON.stringify({
    schemaVersion: 2,
    projects: [{ id: 'default', name: '默认', color: '#9AA4B2', sort: 0 }],
    tasks: [
      { id: 'a1', projectId: 'default', title: '写周报', date: today, done: false, createdAt: stamp, updatedAt: stamp },
      { id: 'a2', projectId: 'default', title: '联系厂家', date: today, done: false, createdAt: stamp, updatedAt: stamp }
    ],
    settings: { view: 'month' }
  })
)

const env = { ...process.env, TRAY_TEST: '1' }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function listTargets() {
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  } catch {
    return []
  }
}

let mainPage
for (let i = 0; i < 60 && !mainPage; i++) {
  const l = await listTargets()
  mainPage = l.find((t) => t.type === 'page' && !t.url.includes('tray.html'))
  if (!mainPage) await sleep(300)
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
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
  return { ws, send, ev }
}

const main = await connect(mainPage)
await sleep(1800)

// 打开托盘弹窗
await main.ev(`window.api.tray.debugOpenMenu()`)
await sleep(1200)

let trayTarget
for (let i = 0; i < 30 && !trayTarget; i++) {
  const l = await listTargets()
  trayTarget = l.find((t) => t.type === 'page' && t.url.includes('tray.html'))
  if (!trayTarget) await sleep(300)
}
if (!trayTarget) {
  console.log(JSON.stringify({ error: 'tray window not found' }))
  child.kill()
  process.exit(1)
}

const tray = await connect(trayTarget)
await sleep(800)

const items = await tray.ev(`document.querySelectorAll('.tray-item').length`)
const circles = await tray.ev(`document.querySelectorAll('.tray-circle').length`)
const headText = await tray.ev(`document.querySelector('.tray-head')?.textContent ?? ''`)

const shotBefore = await tray.send('Page.captureScreenshot', { format: 'png' })
writeFileSync('shots/tray-menu.png', Buffer.from(shotBefore.result.data, 'base64'))

// 点圆圈完成第一条
await tray.ev(`document.querySelector('.tray-circle').click()`)
await sleep(1500)
const afterCircle = JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8'))
const a1Done = afterCircle.tasks.find((t) => t.id === 'a1')?.done
const a2Done = afterCircle.tasks.find((t) => t.id === 'a2')?.done

// 点标题（应打开主窗口并展开该任务，而不是完成）
await tray.ev(`[...document.querySelectorAll('.tray-title')].find((b) => b.textContent.includes('联系厂家')).click()`)
await sleep(1500)
const afterTitle = JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8'))
const a2DoneAfterTitle = afterTitle.tasks.find((t) => t.id === 'a2')?.done
const drawerOpen = await main.ev(`document.querySelector('.drawer')?.classList.contains('is-open') ?? false`)
const drawerTitle = await main.ev(`document.querySelector('.drawer-title')?.value ?? ''`)

console.log(
  JSON.stringify(
    { items, circles, headText: headText.trim(), a1Done, a2Done, a2DoneAfterTitle, drawerOpen, drawerTitle },
    null,
    2
  )
)
main.ev('window.api.win.close()').catch(() => {})
await sleep(1000)
child.kill()
process.exit(0)
