// 验证节流：刚同步过后，改动不会立刻再同步；手动按钮始终生效
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = 9402
const DAV_PORT = 8893
const rel = 'F:\\兴趣项目\\日程管理工具\\dist\\计划清单-0.12.6-win-x64'
const exe = join(rel, '计划清单.exe')
const dataDir = join(rel, 'app', 'data')
mkdirSync(dataDir, { recursive: true })
writeFileSync(
  join(dataDir, 'data.json'),
  JSON.stringify({
    schemaVersion: 1,
    projects: [{ id: 'default', name: '默认', color: '#9AA4B2', sort: 0 }],
    tasks: [{ id: 't1', projectId: 'default', title: '测试任务', date: '2026-10-23', done: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    settings: {}
  })
)

let davLines = 0
const dav = spawn(process.execPath, ['scripts/mock-dav.mjs', String(DAV_PORT)], { stdio: ['ignore', 'pipe', 'ignore'] })
dav.stdout.on('data', (c) => {
  davLines += c.toString().split('\n').filter(Boolean).length
})
await new Promise((r) => setTimeout(r, 600))

const env = { ...process.env, PLAN_DATA_DIR: dataDir }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const child = spawn(exe, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore', env, cwd: rel })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let page
for (let i = 0; i < 60 && !page; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    page = l.find((t) => t.type === 'page')
  } catch {
    /* ignore */
  }
  if (!page) await sleep(300)
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
await sleep(2000)

await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
await sleep(900)
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
await ev(`document.querySelector('.modal-head .icon-btn').click()`)
await sleep(1500)

// 改动后等 20 秒：应该被节流拦住
const beforeChange = davLines
await ev(`document.querySelector('.chip-check')?.click()`)
await sleep(20000)
const afterChange = davLines - beforeChange

// 手动点击同步按钮：必须生效
await ev(`document.querySelector('.tb-sync')?.click()`)
await sleep(4000)
const afterManual = davLines - beforeChange - afterChange

console.log(JSON.stringify({ requestsAfterChange20s: afterChange, requestsAfterManualClick: afterManual }, null, 2))
child.kill()
dav.kill()
process.exit(0)
