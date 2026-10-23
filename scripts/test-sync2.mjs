// 双设备同步验证：A 推 → B 拉 → B 改 → A 拉 → A 删 → B 同步后消失
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import electron from 'electron'

const DAV_PORT = 8791
const dirA = resolve('shots/dev-a')
const dirB = resolve('shots/dev-b')
const storeFile = resolve('shots/mock-dav-2.json')
let portSeq = 9270

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const readData = (dir) => JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8'))
const writeData = (dir, doc) => writeFileSync(join(dir, 'data.json'), JSON.stringify(doc, null, 2), 'utf8')

for (const dir of [dirA, dirB]) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

const base = JSON.parse(readFileSync('shots/testdata/data.seed.json', 'utf8'))
writeData(dirA, base)
writeData(dirB, { ...base, tasks: [] })

const dav = spawn(process.execPath, ['scripts/mock-dav.mjs', String(DAV_PORT), '', storeFile], { stdio: 'ignore' })
await sleep(600)

async function withApp(dir, fn) {
  const port = portSeq++
  const env = { ...process.env, PLAN_DATA_DIR: dir }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.SHOT
  const child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${port}`, '.'], { stdio: 'ignore', env })

  let page
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      page = list.find((t) => t.type === 'page')
    } catch {
      /* 还没起来 */
    }
    if (!page) await sleep(250)
  }
  if (!page) throw new Error(`app did not start for ${dir} on ${port}`)

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
  await sleep(1000)

  try {
    await fn({ ev })
  } finally {
    // 优雅关闭，让 Chromium 把加密密钥落盘
    try {
      await ev('window.api.win.close()')
    } catch {
      /* ignore */
    }
    await sleep(1800)
    ws.close()
    child.kill()
    await sleep(500)
  }
}

async function openSettings(ev) {
  await ev(`document.querySelector('.rail-item[aria-label="设置"]').click()`)
  await sleep(500)
}

async function fillAndSave(ev) {
  await ev(`
    (() => {
      const setV = (el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(el, val)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      const inputs = document.querySelectorAll('.settings-section input.input')
      setV(inputs[0], 'http://127.0.0.1:${DAV_PORT}/')
      setV(inputs[1], 'test@example.com')
      setV(inputs[2], 'app-password')
    })()
  `)
  await sleep(200)
  await ev(`[...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent.includes('保存并同步')).click()`)
  await sleep(2400)
  return ev(`document.querySelector('.settings-message')?.textContent ?? ''`)
}

async function syncNow(ev) {
  for (let i = 0; i < 15; i++) {
    const disabled = await ev(
      `[...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent.includes('立即同步'))?.disabled`
    )
    if (disabled === false) break
    await sleep(200)
  }
  await ev(`[...document.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent.includes('立即同步')).click()`)
  await sleep(2400)
}

async function closeSettings(ev) {
  await ev(`document.querySelector('.modal-head .icon-btn').click()`)
  await sleep(300)
}

const result = {}

// 1) A 首次推送
await withApp(dirA, async ({ ev }) => {
  await openSettings(ev)
  result.aSync = await fillAndSave(ev)
  await closeSettings(ev)
})
result.remoteAfterA = JSON.parse(readFileSync(storeFile, 'utf8')).tasks.length

// 2) B 首次拉取
await withApp(dirB, async ({ ev }) => {
  await openSettings(ev)
  result.bSync = await fillAndSave(ev)
  await closeSettings(ev)
})
result.bTasks = readData(dirB).tasks.filter((t) => !t.deletedAt).length

// 3) B 新建一条并推送
await withApp(dirB, async ({ ev }) => {
  await ev(`
    (() => {
      const cell = [...document.querySelectorAll('.cell')].find((c) => c.querySelector('.cell-date')?.textContent === '28' && !c.classList.contains('is-out'))
      cell.click()
    })()
  `)
  await sleep(500)
  await ev(`
    (() => {
      const input = document.querySelector('.drawer-title')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'B 设备新建的任务')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()
  `)
  await ev(`document.querySelector('.drawer-actions .btn-primary').click()`)
  await sleep(1200)
  await openSettings(ev)
  await syncNow(ev)
  await closeSettings(ev)
})
result.bHasNew = readData(dirB).tasks.some((t) => t.title === 'B 设备新建的任务')

// 4) A 拉取 B 的新任务
await withApp(dirA, async ({ ev }) => {
  await openSettings(ev)
  await syncNow(ev)
  await closeSettings(ev)
})
const aDoc = readData(dirA)
result.aHasB = aDoc.tasks.some((t) => t.title === 'B 设备新建的任务')

// 5) A 删除该任务（墓碑）并推送
const victim = aDoc.tasks.find((t) => t.title === 'B 设备新建的任务')
const now = new Date().toISOString()
writeData(dirA, {
  ...aDoc,
  tasks: aDoc.tasks.map((t) => (t.id === victim.id ? { ...t, deletedAt: now, updatedAt: now } : t))
})
await withApp(dirA, async ({ ev }) => {
  await openSettings(ev)
  await syncNow(ev)
  await closeSettings(ev)
})

// 6) B 同步后应看到墓碑
await withApp(dirB, async ({ ev }) => {
  await openSettings(ev)
  await syncNow(ev)
  await closeSettings(ev)
})
const bDoc = readData(dirB)
result.bTombstone = Boolean(bDoc.tasks.find((t) => t.title === 'B 设备新建的任务')?.deletedAt)
result.bVisibleCount = bDoc.tasks.filter((t) => !t.deletedAt).length

console.log(JSON.stringify(result, null, 2))
dav.kill()
process.exit(0)
