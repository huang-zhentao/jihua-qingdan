// 只用来给效果图截图：把 mock-inbox.html 渲染成 PNG
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

// 这台机器上默认 userData 不可写会让 Electron 在 whenReady 前崩溃
const userData = join(__dirname, '..', 'shots', '.mock-userdata')
mkdirSync(userData, { recursive: true })
app.setPath('userData', userData)

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: Number(process.env.MOCK_W || 264),
    height: Number(process.env.MOCK_H || 804),
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: '#eef1f5',
    webPreferences: { sandbox: false }
  })
  await win.loadFile(join(__dirname, '..', 'shots', process.env.MOCK_HTML || 'mock-inbox.html'))
  await new Promise((r) => setTimeout(r, 600))
  const img = await win.webContents.capturePage()
  writeFileSync(join(__dirname, '..', 'shots', process.env.MOCK_OUT || 'inbox-heatmap-mock.png'), img.toPNG())
  app.quit()
})
