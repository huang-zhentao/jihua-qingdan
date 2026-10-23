# macOS 适配说明

> 目标：让「计划清单」在 macOS（Apple Silicon / Intel）上能正常开发、打包和日常使用，
> 同时**不改变 Windows 版原有行为**。

## 1. 兼容策略

所有改动都按 `process.platform` 分支，只有 macOS 才会走到新代码：

- 主进程：`const isMac = process.platform === 'darwin'`，窗口、菜单、托盘、登录项、打开目录等均加分支；
- 渲染进程：用 `window.api.platform` 决定快捷键提示和设置页文案；
- 打包配置：新增 `mac` 相关字段，`win` / `portable` / `nsis` 配置一行未动。

逐项对照见第 3 节，Windows 分支的执行结果与改造前一致。

## 2. macOS 上的行为

| 能力 | 实现 |
|---|---|
| 标题栏 | `titleBarStyle: 'hiddenInset'` + 系统红绿灯（原代码 `frame:false` 在 macOS 上会把红绿灯一起干掉，已修正），红绿灯位置 `{x:14, y:11}`，标题栏左侧留 84px |
| 应用菜单 | 自建最小菜单：关于/设置…(⌘,)/隐藏/退出、编辑（撤销/复制/粘贴/全选）、窗口（最小化/缩放/关闭/全屏）；开发态额外有视图（重载/开发者工具） |
| 菜单栏图标 | 使用模板图 `trayTemplate.png` + `@2x`，自动适配浅色/深色菜单栏；点图标弹出菜单（显示窗口、勾掉今天未完成任务、退出） |
| 关闭窗口 | 与 Windows 一样只隐藏、不退出；`⌘W` 隐藏，`⌘Q` 或菜单「退出计划清单」才退出 |
| 快捷键 | `⌘K` 搜索（原代码已兼容 metaKey），搜索按钮提示显示 `⌘K` |
| 登录时启动 | `app.setLoginItemSettings({ openAtLogin, type: 'mainAppService' })`（macOS 13+ SMAppService，失败回退旧接口）；设置页文案改为「登录时启动」 |
| 通知 | 系统通知 + 点击通知唤起窗口并打开对应日程（与 Windows 共用 `src/main/reminders.ts`） |
| 数据目录 | `~/Library/Application Support/jihua-qingdan/data.json`；打包后不会再往 `.app` 内部写数据（只读且会破坏签名） |
| 打开数据目录 | `shell.openPath` 失败时回退 `open` 命令（Windows 仍是 `explorer.exe`） |
| Dock | 开发态显示自己的图标；打包态用 `icon.icns`（按 Apple 图标网格留边，非全出血） |

## 3. 改动文件

| 文件 | 改动（全部为 `isMac` 分支内新增） |
|---|---|
| `src/main/index.ts` | 平台常量；`AppUserModelId` 仅 Windows；数据目录打包态回退排除 `.app`；`BrowserWindow` 选项按平台组装；`setWindowButtonVisibility(true)`；`showWindow()` 里 `app.show()`；菜单栏模板图 + 模板标记；`createMacMenu()`；开发态 Dock 图标；`openDataDir` 回退 `open`；登录项 SMAppService 分支；`Notification.isSupported()` 日志 |
| `src/preload/index.ts` | 新增 `app.onOpenSettings`（供 mac 菜单「设置…」使用，Windows 不会触发） |
| `src/renderer/src/App.tsx` | 搜索按钮提示按平台显示 `⌘K` / `Ctrl+K`；监听「设置…」事件 |
| `src/renderer/src/components/SettingsDialog.tsx` | 「开机自启/登录时启动」、「托盘/菜单栏」文案按平台切换（Windows 原文案不变） |
| `package.json` | 新增 `dist:mac`、`test:mac` 脚本；`mac.icon` 指向 `build/icon.icns`、`minimumSystemVersion`、`artifactName`、`mac.extraResources`（菜单栏模板图）；`dmg.title`。Windows 配置未改动 |
| `build/icon.icns`、`build/trayTemplate*.png` | 新增 macOS 图标资源（由 `scripts/make-mac-icons.py` 生成） |
| `scripts/make-mac-icons.py`、`scripts/test-mac.mjs` | 图标生成脚本、macOS 自检脚本 |
| `启动开发模式.command` | macOS 双击启动开发模式（Windows 的 `.cmd` 保留不动） |
| `README.md`、`.gitignore` | 补充 mac 开发/打包/签名说明 |

## 4. 使用

```bash
# 开发（两平台相同）
npm install
npm run dev                 # 或双击 启动开发模式.command

# macOS 打包（必须在 macOS 上执行）
npm run dist:mac            # 产物：dist/计划清单-x.y.z-<arch>.dmg

# macOS 自检（先 build）
npm run build && npm run test:mac
```

依赖安装时 Electron 二进制要从 GitHub 下载，国内网络可先 `proxy-on`（或设置
`ELECTRON_GET_USE_PROXY=1` / `ELECTRON_MIRROR`）。

## 5. 验证记录（2026-10-24，macOS 27 arm64，Electron 33.4.11）

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | 通过 |
| `npm run build` | 通过 |
| `node scripts/e2e.mjs`（回归：抽屉/日期/提前提醒/圆点/删除撤销/搜索/日视图） | 12 项全部通过 |
| `node scripts/test-mac.mjs`（菜单/菜单栏图标/⌘K/⌘K 提示/设置文案/打开目录/提醒触发/关闭隐藏/二次实例唤回） | 全部通过 |
| 打包态（`dist/mac-arm64/计划清单.app`）：默认数据目录、菜单、菜单栏模板图、通知可用、打开数据目录、登录项开关（enabled → not-registered） | 全部通过 |
| `dist/计划清单-0.12.8-arm64.dmg` 挂载、应用包信息（Bundle ID / 图标 / 最低系统 12.0） | 通过 |
| 打包态启动截图（`SHOT=1`） | 渲染正常 |
| **Finder 双击启动**（LaunchServices 启动 `dist/mac-arm64/计划清单.app`） | 成功：菜单、菜单栏图标、窗口正常创建（日志 `mac menu created` / `tray created template` / `createWindow ok`） |
| `dist/计划清单-0.12.8-arm64.dmg` 挂载 → 拖入 /Applications → 启动 | 成功 |

## 6. 已知限制

1. **未签名/未公证**：本机没有 Developer ID 证书，electron-builder 会跳过签名；本机构建出来的 dmg
   直接双击可以正常启动（已在 macOS 27 上验证）。如果 dmg 是从网络/AirDrop 拷来的（带 quarantine），
   首次打开请右键 →「打开」，或执行 `xattr -dr com.apple.quarantine /Applications/计划清单.app`。
   有 Developer ID 证书后直接 `npm run dist:mac` 会自动签名、可正常公证分发。
2. **架构**：`build.electronDist` 指向本机 `node_modules/electron/dist`，所以 `dist:mac` 默认打出
   当前机器架构的包（Apple Silicon 出 arm64）。Intel 包请在 Intel Mac 上执行同一条命令。
3. 自动更新、公证、GitHub Actions 尚未接入（与原项目规划一致）。
4. 沙箱/权限：macOS 首次发送通知需在系统设置里允许；「登录时启动」在 macOS 13+ 走
   SMAppService，系统设置中会显示为「计划清单」。
5. 在**设置了 `ELECTRON_RUN_AS_NODE`** 的终端里（例如某些 Electron IDE 的内置终端）执行
   `open 计划清单.app` 会启动异常：该变量会让 Electron 退化成纯 Node。用 Finder 双击即可，
   或在命令前加 `env -u ELECTRON_RUN_AS_NODE open …`。
