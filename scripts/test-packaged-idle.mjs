// 用打包后的程序验证：空闲时不反复同步
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = 9401
const DAV_PORT = 8894
const exe = 'F:\\兴趣项目\\日程管理工具\\dist\\计划清单-0.12.6-win-x64\\计划清单.exe'
const workDir = 'F:\\兴趣项目\\日程管理工具\\dist\\计划清单-0.12.6-win-x64'
const dataDir = join(workDir, 'app', 'data')
mkdirSync(dataDir, { recursive: true })
writeFileSync(join(dataDir, 'data.json'), JSON.stringify({ schemaVersion: 1, projects: [{ id: 'default', name: '默认', color: '#9AA4B2', sort: 0 }], tasks: [], settings: {} }))

let davLines = 0
const dav = spawn(process.execPath, ['scripts/mock-dav.mjs', String(DAV_PORT)], { stdio: ['ignore', 'pipe', 'ignore'] })
dav.stdout.on('data', (c) => {
  davLines += c.toString().split('\n').filter(Boolean).length
})
await new Promise((r) => setTimeout(r, 600))

const env = { ...process.env, PLAN_DATA_DIR: dataDir }
delete env.ELECTRON_RUN_AS_NODE
delete env.SHOT
const child = spawn(exe, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore', env, cwd: workDir })
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
if (!page) {
  console.log('no page')
  child.kill()
  dav.kill()
  process.exit(1)
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
await send('Page.enable')
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
const version = await ev(`document.querySelector('.settings-footnote')?.textContent ?? ''`)
await ev(`document.querySelector('.modal-head .icon-btn').click()`)
await sleep(1500)

const baseline = davLines
await sleep(45000)
const idle = davLines - baseline

console.log(JSON.stringify({ version: version.slice(0, 40), requestsDuringConfig: baseline, requestsDuringIdle60s: idle }, null, 2))
child.kill()
dav.kill()
process.exit(0)
