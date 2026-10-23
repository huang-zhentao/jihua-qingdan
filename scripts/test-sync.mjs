// 同步端到端验证：本地 ↔ 模拟 WebDAV，检查双向合并结果
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electron from 'electron'

const PORT = 9231
const DAV_PORT = 8787
const dir = process.env.PLAN_DATA_DIR
const localFile = join(dir, 'data.json')
const storeFile = 'shots/mock-dav-store.json'
const seedFile = 'shots/mock-dav-seed.json'

const pad = (n) => String(n).padStart(2, '0')
const now = new Date()
const iso = (d) => d.toISOString()

// 远端预置一条「来自另一台设备」的任务
const seed = JSON.parse(readFileSync(join(dir, 'data.seed.json'), 'utf8'))
seed.tasks.push({
  id: 'remote-1',
  projectId: 'work',
  title: '来自另一台设备的日程',
  date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  done: false,
  createdAt: iso(now),
  updatedAt: iso(now)
})
writeFileSync(seedFile, JSON.stringify(seed), 'utf8')

const dav = spawn(process.execPath, ['scripts/mock-dav.mjs', String(DAV_PORT), seedFile, storeFile], {
  stdio: 'ignore'
})

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const app = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${PORT}`, '.'], { stdio: 'ignore', env })

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

// 打开设置
await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
await sleep(500)

// 填表
await ev(`
  (() => {
    const setV = (el, val) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const inputs = document.querySelectorAll('.settings-section input')
    setV(inputs[0], 'http://127.0.0.1:${DAV_PORT}/')
    setV(inputs[1], 'test@example.com')
    setV(inputs[2], 'app-password')
  })()
`)
await sleep(200)
await ev(`[...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent.includes('保存并同步')).click()`)
await sleep(2500)

const local = JSON.parse(readFileSync(localFile, 'utf8'))
const remote = JSON.parse(readFileSync(storeFile, 'utf8'))

console.log(
  JSON.stringify(
    {
      localHasRemoteTask: local.tasks.some((t) => t.title === '来自另一台设备的日程'),
      remoteHasLocalTasks: remote.tasks.length > 0,
      remoteIds: remote.tasks.length,
      localIds: local.tasks.filter((t) => !t.deletedAt).length,
      message: await ev(`document.querySelector('.settings-message')?.textContent ?? ''`)
    },
    null,
    2
  )
)

app.kill()
dav.kill()
setTimeout(() => process.exit(0), 300)
