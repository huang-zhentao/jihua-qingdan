// 两设备验证：收集箱任务（无日期）是否能同步过去
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const DAV_PORT = 8892
const dirA = join(process.cwd(), 'shots', 'sync-a')
const dirB = join(process.cwd(), 'shots', 'sync-b')
for (const d of [dirA, dirB]) mkdirSync(d, { recursive: true })

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const stamp = new Date().toISOString()

writeFileSync(
  join(dirA, 'data.json'),
  JSON.stringify({
    schemaVersion: 2,
    projects: [{ id: 'default', name: '默认', color: '#9AA4B2', sort: 0 }],
    tasks: [
      { id: 'inbox-1', projectId: 'default', title: '收集箱里的任务', done: false, createdAt: stamp, updatedAt: stamp },
      { id: 'dated-1', projectId: 'default', title: '有日期的任务', date: today, done: false, createdAt: stamp, updatedAt: stamp }
    ],
    settings: { view: 'month' }
  })
)
writeFileSync(
  join(dirB, 'data.json'),
  JSON.stringify({
    schemaVersion: 2,
    projects: [{ id: 'default', name: '默认', color: '#9AA4B2', sort: 0 }],
    tasks: [],
    settings: { view: 'month' }
  })
)

const dav = spawn(process.execPath, ['scripts/mock-dav.mjs', String(DAV_PORT)], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 600))

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openApp(port, dataDir) {
  const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${port}`, '.'], {
    stdio: 'ignore',
    env: { ...env, PLAN_DATA_DIR: dataDir }
  })
  let page
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
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
  await sleep(1600)
  return { child, ev }
}

async function configureSync(ev) {
  await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
  await sleep(800)
  await ev(`
    (() => {
      const section = [...document.querySelectorAll('.settings-section')].find((s) => s.textContent.includes('WebDAV'))
      const inputs = section.querySelectorAll('input.input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(inputs[0], 'http://127.0.0.1:${DAV_PORT}/'); inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
      setter.call(inputs[1], 'u'); inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
      setter.call(inputs[2], 'p'); inputs[2].dispatchEvent(new Event('input', { bubbles: true }))
    })()
  `)
  await sleep(300)
  await ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('保存并同步')).click()`)
  await sleep(4000)
}

// 设备 A：配置同步并推上去
const a = await openApp(9430, dirA)
await configureSync(a.ev)
a.ev('window.api.win.close()').catch(() => {})
await sleep(1500)
a.child.kill()

// 设备 B：也用界面配置一次（safeStorage 与实例绑定，不能直接拷凭据），
// 然后同步，应当把 A 推上去的数据（含收集箱任务）拉下来
const b = await openApp(9431, dirB)
await configureSync(b.ev)
await sleep(3000)
const dataB = JSON.parse(readFileSync(join(dirB, 'data.json'), 'utf8'))
const inboxTask = dataB.tasks.find((t) => t.id === 'inbox-1')
const datedTask = dataB.tasks.find((t) => t.id === 'dated-1')

console.log(
  JSON.stringify(
    {
      totalInB: dataB.tasks.length,
      inboxTask: inboxTask ? { title: inboxTask.title, date: inboxTask.date ?? null } : null,
      datedTask: datedTask ? { title: datedTask.title, date: datedTask.date ?? null } : null
    },
    null,
    2
  )
)
b.ev('window.api.win.close()').catch(() => {})
await sleep(1200)
b.child.kill()
dav.kill()
process.exit(0)
