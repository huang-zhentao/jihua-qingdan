// macOS 功能自检（只在 macOS 上有意义，Windows 上直接跳过）
// 覆盖：菜单、菜单栏图标、通知、⌘K、关闭到菜单栏、二次实例唤回、打开数据目录、mac 文案
// 用法（先 npm run build）：node scripts/test-mac.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require2 = createRequire(import.meta.url)
const electron = require2('electron')
const REPO = process.cwd()
const DIR = join(tmpdir(), 'jihua-mac-check')
const PORT = 9321

if (process.platform !== 'darwin') {
  console.log('skip: 不是 macOS')
  process.exit(0)
}

rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })

const env = { ...process.env, PLAN_DATA_DIR: DIR }
delete env.ELECTRON_RUN_AS_NODE

const logFile = join(DIR, 'logs', 'main.log')
const logText = () => {
  try {
    return readFileSync(logFile, 'utf8')
  } catch {
    return ''
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const child = spawn(electron, [`--remote-debugging-port=${PORT}`, '.'], { cwd: REPO, stdio: 'ignore', env })

let page
for (let i = 0; i < 60 && !page; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    page = list.find((t) => t.type === 'page')
  } catch {
    /* 还没起来 */
  }
  if (!page) await sleep(250)
}
if (!page) {
  console.log(JSON.stringify({ ok: false, reason: 'renderer 没起来' }, null, 2))
  child.kill()
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
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}
await send('Runtime.enable')
await sleep(1500)

const out = {}

out.platform = await ev('window.api.platform')
out.macMenu = /mac menu created (.+)/.exec(logText())?.[1] ?? null
out.tray = /tray created (.+)/.exec(logText())?.[1]?.trim() ?? null
out.notificationSupported = /notifications supported (\w+)/.exec(logText())?.[1] ?? null
out.dataDir = /dataDir (.+)/.exec(logText())?.[1]?.trim() ?? null

// ⌘K 搜索
await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))`)
await sleep(300)
out.searchOpenedByCmdK = await ev(`Boolean(document.querySelector('.search-input'))`)
await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
await sleep(300)
out.searchHint = await ev(
  `[...document.querySelectorAll('button[title]')].map((b) => b.title).find((t) => t.includes('搜索'))`
)

// 设置页的 macOS 文案
await ev(`document.querySelectorAll('.rail-item')[document.querySelectorAll('.rail-item').length - 1].click()`)
await sleep(500)
const settingsText = await ev(`document.querySelector('.modal')?.innerText ?? ''`)
out.settingsMacText = /登录时启动/.test(settingsText) && /菜单栏图标/.test(settingsText)
out.closeSettings = await ev(`
  (() => {
    const btn = [...document.querySelectorAll('.modal button')].find((b) => b.textContent.trim() === '关闭')
    btn?.click()
    return Boolean(btn)
  })()
`)
await sleep(300)

// 打开数据目录
out.openDataDirOk = (await ev(`window.api.app.openDataDir()`))?.ok === true

// 提前 5 秒的提醒 → 主进程计时器触发
const at = new Date(Date.now() + 5000).toISOString()
await ev(
  `window.api.notify.sync([{ id: 'mac-check-1', title: 'test-mac 提醒', at: ${JSON.stringify(at)}, date: '2026-10-24' }])`
)
await sleep(6500)
out.reminderFired = /reminder fired test-mac 提醒/.test(logText())

// 关闭窗口只收进菜单栏，进程不退出
await ev(`window.api.win.close()`)
await sleep(1200)
out.windowHidden = /window hidden to tray/.test(logText())
out.mainStillRunning = child.exitCode === null

// 二次启动 → 唤回已有窗口
const before = logText().length
const second = spawn(electron, ['.'], { cwd: REPO, stdio: 'ignore', env })
await sleep(5000)
out.secondInstanceShow = /second-instance/.test(logText().slice(before))
second.kill()

console.log(JSON.stringify(out, null, 2))
child.kill()
await sleep(500)
process.exit(0)
