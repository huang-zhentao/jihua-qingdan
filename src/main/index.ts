import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { spawn } from 'node:child_process'
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { backupBroken, backupNow, dataFilePath, readData, writeData } from './store'
import { syncReminders, type ReminderItem } from './reminders'
import { getStatus, configBroken, loadConfig, resetSyncCache, saveConfig, syncNow, testConnection, type SyncConfig } from './sync'
import {
  AI_PROVIDERS,
  hasApiKey,
  loadAiConfig,
  loadApiKey,
  saveAiConfig,
  saveApiKey,
  streamChat,
  testAi,
  sanitizeKey,
  type AiConfig,
  type ChatMessage
} from './ai'
import { loadWindowState, saveWindowState } from './windowState'

const isMac = process.platform === 'darwin'
const shotMode = Boolean(process.env.SHOT)
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// Windows 上必须设置 AppUserModelId，否则系统通知不会显示应用名
app.setAppUserModelId('com.tao.jihuaqingdan')

const EXE_DIR = dirname(process.execPath)

/**
 * Electron 在数据目录不可写时会在 whenReady 阶段直接崩溃（0xC0000005），
 * 且崩在 JS 之前、连日志都留不下。所以必须在启动最早期就选一个真正能写的目录。
 */
function writableDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-probe-${process.pid}`)
    writeFileSync(probe, 'ok')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

/**
 * 数据目录优先级：
 * 1. PLAN_DATA_DIR（测试用）
 * 2. %APPDATA%\jihua-qingdan        标准位置
 * 3. %LOCALAPPDATA%\jihua-qingdan   漫游目录不可写时退到这里（同样不会随安装目录被覆盖）
 * 4. 程序目录\data                  便携版
 * 5. 临时目录                       最后的兜底
 */
function pickDataDir(): string {
  const override = process.env.PLAN_DATA_DIR
  if (override) return override

  const roaming = join(app.getPath('appData'), 'jihua-qingdan')
  const profile = process.env.USERPROFILE ? join(process.env.USERPROFILE, '计划清单数据') : null
  const localAppData = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'jihua-qingdan') : null
  const portable = app.isPackaged ? join(EXE_DIR, 'data') : join(process.cwd(), '.data')

  const list = [roaming, profile, localAppData, portable, join(tmpdir(), 'jihua-qingdan')].filter(
    (d): d is string => Boolean(d)
  )
  for (const dir of list) {
    if (writableDir(dir)) {
      migrateDataIfNeeded(dir, list)
      return dir
    }
  }
  return app.getPath('userData')
}

/** 新位置还没有 data.json、但旧位置有时，把数据和备份搬过来一次 */
function migrateDataIfNeeded(target: string, candidates: string[]): void {
  const hasData = existsSync(join(target, 'data.json'))
  if (hasData) return
  for (const source of candidates) {
    if (source === target) continue
    const file = join(source, 'data.json')
    if (!existsSync(file)) continue
    try {
      copyFileSync(file, join(target, 'data.json'))
      const backupDir = join(source, 'backups')
      if (existsSync(backupDir)) {
        cpSync(backupDir, join(target, 'backups'), { recursive: true })
      }
      return
    } catch {
      // 迁移失败就继续用默认空数据，不阻断启动
    }
  }
}

const APP_DIR = pickDataDir()
app.setPath('userData', APP_DIR)

let logFile = join(APP_DIR, 'logs', 'main.log')

function log(...parts: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${parts
    .map((p) => (typeof p === 'string' ? p : p instanceof Error ? (p.stack ?? p.message) : JSON.stringify(p)))
    .join(' ')}`
  const write = (target: string): boolean => {
    try {
      mkdirSync(dirname(target), { recursive: true })
      appendFileSync(target, line + '\n')
      return true
    } catch {
      return false
    }
  }
  if (!write(logFile)) {
    // 数据目录不可写时，日志落到 exe 旁边，方便排查
    const fallback = join(EXE_DIR, 'main.log')
    if (fallback !== logFile && write(fallback)) logFile = fallback
  }
  if (!shotMode) console.log(line)
}


log('================ boot ================')
log('electron', process.versions.electron, '| chrome', process.versions.chrome, '| node', process.versions.node)
log('platform', `${process.platform} ${process.arch}`, '| os', process.getSystemVersion())
log('argv', process.argv.slice(1).join(' '))
log('dataDir', APP_DIR)
log('logFile', logFile)
log('packaged', app.isPackaged, '| NO_SANDBOX', process.env.NO_SANDBOX ?? '(unset)')

process.on('uncaughtException', (err) => log('uncaughtException', err))
process.on('unhandledRejection', (err) => log('unhandledRejection', err as Error))
app.on('render-process-gone', (_e, _wc, details) => log('render-process-gone', details))
app.on('child-process-gone', (_e, details) => log('child-process-gone', details))

if (shotMode) {
  // 截图环境通常没有可用的 GPU/桌面会话
  app.disableHardwareAcceleration()
}

function createWindow(): void {
  log('createWindow start')
  const saved = loadWindowState()
  try {
    mainWindow = new BrowserWindow({
      x: saved.x,
      y: saved.y,
      width: saved.width,
      height: saved.height,
      minWidth: 1040,
      minHeight: 720,
      show: false,
      frame: false,
      icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(process.cwd(), 'build', 'icon.png'),
      titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
      trafficLightPosition: { x: 14, y: 11 },
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
  } catch (err) {
    log('BrowserWindow failed', err)
    throw err
  }
  if (saved.maximized) mainWindow.maximize()
  log('createWindow ok')

  const persistBounds = (): void => {
    if (!mainWindow) return
    const bounds = mainWindow.getNormalBounds()
    saveWindowState({ ...bounds, maximized: mainWindow.isMaximized() })
  }

  mainWindow.on('resize', persistBounds)
  mainWindow.on('move', persistBounds)
  mainWindow.on('maximize', () => mainWindow?.webContents.send('win:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('win:maximized', false))
  mainWindow.on('close', (event) => {
    persistBounds()
    if (isQuitting || shotMode) return
    // 关闭只收进托盘，不退出
    event.preventDefault()
    mainWindow?.hide()
    log('window hidden to tray')
  })

  mainWindow.once('ready-to-show', () => {
    log('ready-to-show')
    if (shotMode) {
      void captureAndExit(mainWindow!)
      return
    }
    mainWindow?.show()
    log('window shown')
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log('did-fail-load', code, desc, url)
  })
  mainWindow.webContents.on('did-finish-load', () => log('did-finish-load'))

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  log('loading', devUrl ?? 'file')
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch((err) => log('loadURL failed', err))
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).catch((err) => log('loadFile failed', err))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

let trayTasks: Array<{ id: string; title: string; date: string }> = []

function buildTrayMenu(): Menu {
  const items: Electron.MenuItemConstructorOptions[] = []

  if (trayTasks.length === 0) {
    items.push({ label: '今天没有未完成任务', enabled: false })
  } else {
    items.push({ label: `今天未完成（${trayTasks.length} 条）`, enabled: false })
    for (const task of trayTasks.slice(0, 12)) {
      items.push({
        label: task.title.length > 26 ? `${task.title.slice(0, 26)}…` : task.title,
        click: () => {
          mainWindow?.webContents.send('tray:complete', task.id)
          log('tray complete', task.id)
        }
      })
    }
    if (trayTasks.length > 12) items.push({ label: `还有 ${trayTasks.length - 12} 条…`, enabled: false })
  }

  items.push({ type: 'separator' })
  items.push({ label: '显示计划清单', click: () => showWindow() })
  items.push({ type: 'separator' })
  items.push({
    label: '退出计划清单',
    click: () => {
      isQuitting = true
      app.quit()
    }
  })

  return Menu.buildFromTemplate(items)
}

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(buildTrayMenu())
  tray.setToolTip(trayTasks.length ? `计划清单 · 今天还有 ${trayTasks.length} 条` : '计划清单')
}

function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function trayIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(process.cwd(), 'build', 'icon.png')
}

function createTray(): void {
  if (tray || shotMode) return
  try {
    const image = nativeImage.createFromPath(trayIconPath())
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }))
    tray.setToolTip('计划清单')
    tray.setContextMenu(buildTrayMenu())
    tray.on('click', () => {
      if (!mainWindow) return
      if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
      else showWindow()
    })
    log('tray created')
  } catch (err) {
    log('tray failed', err)
  }
}

async function captureAndExit(win: BrowserWindow): Promise<void> {  try {
    await new Promise((r) => setTimeout(r, 1500))
    const image = await win.webContents.capturePage()
    const out = process.env.SHOT_OUT ?? 'shot.png'
    await writeFile(out, image.toPNG())
    log('shot saved', out)
  } catch (err) {
    log('shot failed', err)
  } finally {
    app.exit(0)
  }
}

ipcMain.on('win:minimize', () => mainWindow?.minimize())
ipcMain.on('win:toggle-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
})
ipcMain.on('win:close', () => mainWindow?.close())

ipcMain.on('notify:sync', (_e, list: ReminderItem[]) => {
  const count = syncReminders(
    list ?? [],
    (taskId, date) => {
      log('notification clicked', taskId, date)
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('app:open-task', taskId, date)
    },
    (item) => log('reminder fired', item.title)
  )
  log('reminders scheduled', count)
})

ipcMain.on('tray:update', (_e, tasks: Array<{ id: string; title: string; date: string }>) => {
  trayTasks = Array.isArray(tasks) ? tasks : []
  refreshTrayMenu()
  log('tray tasks', trayTasks.length)
})

// 仅自动化测试使用：模拟点击托盘菜单里的第一条任务
if (process.env.TRAY_TEST === '1') {
  ipcMain.on('tray:debug-complete', () => {
    const first = trayTasks[0]
    if (first) mainWindow?.webContents.send('tray:complete', first.id)
  })
}

ipcMain.handle('store:import', async () => {
  const res = await dialog.showOpenDialog({
    title: '选择 data.json',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  try {
    const text = readFileSync(res.filePaths[0], 'utf8')
    const doc = JSON.parse(text) as { tasks?: unknown[]; projects?: unknown[] }
    if (!Array.isArray(doc.tasks) || !Array.isArray(doc.projects)) {
      return { ok: false, message: '不是计划清单的数据文件' }
    }
    backupNow()
    writeData(text)
    log('data imported', res.filePaths[0])
    return { ok: true, count: doc.tasks.length }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
})

ipcMain.handle('store:read', () => {
  const raw = readData()
  if (!raw) return null
  try {
    JSON.parse(raw)
    return raw
  } catch (err) {
    const saved = backupBroken(raw)
    log('data.json 解析失败，已备份', saved ?? '(备份失败)', (err as Error).message)
    return null
  }
})
ipcMain.handle('store:write', (_e, raw: string) => writeData(raw))
ipcMain.handle('store:backup', () => backupNow())
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  dataDir: app.getPath('userData'),
  dataFile: dataFilePath()
}))
ipcMain.handle('app:openDataDir', async () => {
  const dir = app.getPath('userData')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // 目录建不出来也继续尝试打开
  }
  const err = await shell.openPath(dir)
  if (!err) return { ok: true }
  // ShellExecute 偶发失败时会弹系统错误框；改用 explorer.exe 直接打开
  try {
    spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref()
    return { ok: true, viaExplorer: true }
  } catch (e) {
    return { ok: false, message: err || (e as Error).message }
  }
})

ipcMain.handle('app:setLoginItem', (_e, enabled: boolean) => {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ['--no-sandbox'] })
  }
  log('login item', enabled)
  return enabled
})
ipcMain.handle('app:getLoginItem', () => (app.isPackaged ? app.getLoginItemSettings().openAtLogin : false))

ipcMain.handle('sync:status', () => ({ configured: Boolean(loadConfig()), status: getStatus() }))
ipcMain.handle('sync:config', () => {
  const cfg = loadConfig()
  return cfg
    ? { url: cfg.url, username: cfg.username, broken: configBroken() }
    : { url: '', username: '', broken: configBroken() }
})
ipcMain.handle('sync:save', (_e, cfg: SyncConfig) => {
  saveConfig(cfg)
  resetSyncCache()
  log('sync config saved', cfg.url, cfg.username)
  return true
})
ipcMain.handle('sync:test', async (_e, cfg: SyncConfig) => testConnection(cfg))
ipcMain.handle('sync:now', async (_e, raw: string) => {
  const result = await syncNow(raw)
  log('sync', result.status.state, result.status.message ?? '')
  return result
})

ipcMain.handle('ai:config', () => ({ ...loadAiConfig(), hasKey: hasApiKey(), providers: AI_PROVIDERS }))
ipcMain.handle('ai:save', (_e, payload: { config: AiConfig; apiKey?: string }) => {
  const { key, error } = sanitizeKey(payload.apiKey ?? '')
  if (error) return { ok: false, message: error }
  saveAiConfig(payload.config)
  if (key) saveApiKey(key)
  log('ai config saved', payload.config.provider, payload.config.model)
  return { ok: true }
})
ipcMain.handle('ai:test', async (_e, payload: { config: AiConfig; apiKey: string }) =>
  testAi(payload.config, payload.apiKey?.trim() || loadApiKey())
)
let aiAbort: AbortController | null = null

ipcMain.on('ai:chat', async (event, payload: { messages: ChatMessage[] }) => {
  const sender = event.sender
  aiAbort?.abort()
  aiAbort = new AbortController()
  try {
    const full = await streamChat(
      loadAiConfig(),
      loadApiKey(),
      payload.messages,
      (text) => sender.send('ai:chunk', text),
      aiAbort.signal
    )
    sender.send('ai:done', full)
  } catch (err) {
    const message = (err as Error).message ?? ''
    if ((err as Error).name === 'AbortError' || message.includes('aborted')) {
      sender.send('ai:aborted')
    } else {
      log('ai chat failed', message)
      sender.send('ai:error', message)
    }
  } finally {
    aiAbort = null
  }
})

ipcMain.on('ai:abort', () => {
  aiAbort?.abort()
  aiAbort = null
})


// 锁拿不到时只记一条日志、继续启动：宁可多开一个窗口，也不要静默退出。
const gotLock = app.requestSingleInstanceLock()
log('single instance lock', String(gotLock))

if (!gotLock) {
  // 数据目录现在保证可写，拿不到锁基本就是已经有实例在跑
  log('another instance is running, quitting')
  app.quit()
} else {
  app.on('second-instance', () => {
    log('second-instance')
    showWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app
    .whenReady()
    .then(() => {
      log('app ready')
      createWindow()
      createTray()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
        else showWindow()
      })
    })
    .catch((err) => log('whenReady failed', err))

  app.on('window-all-closed', () => {
    log('window-all-closed')
    if (!isMac) app.quit()
  })

  app.on('will-quit', () => log('will-quit'))
  app.on('quit', (_e, code) => log('quit', code))
}
