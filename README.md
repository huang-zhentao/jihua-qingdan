# 计划清单

**下载**：https://github.com/huang-zhentao/jihua-qingdan/releases/latest （Windows 安装包 / macOS dmg）

一个 Windows / macOS 桌面日历 + 待办应用，用 Electron + React + TypeScript 构建。

## 功能

- **月历**：农历、节气、节日、休班标记；年月快速跳转；「今」一键回到今天
- **任务**：右侧抽屉增删改；日期、项目分类、优先级、背景色；备注支持简单 Markdown
- **提醒**：按天提前 1–5 天，到点弹系统通知，点通知直接打开对应日程
- **待办视图**：左侧迷你日历（有任务的日期带灰点）、当天日程、按项目筛选
- **常驻菜单栏/托盘**：关窗口不退出；Windows 右键托盘、macOS 点菜单栏图标，可直接勾掉今天未完成的任务
- **搜索**：`Ctrl+K`（macOS 为 `⌘K`）全局搜索任务
- **同步**：WebDAV（坚果云 / 群晖 / Nextcloud 等），自动同步间隔可选
- **AI 助手**：接入 OpenAI 兼容接口（默认 DeepSeek），对话式分析近期任务
- **深色模式**：浅色 / 深色 / 跟随系统

## 开发

```bash
npm install
npm run dev
```

- Windows 也可以双击 `启动开发模式.cmd`
- macOS 也可以双击 `启动开发模式.command`（首次可能需要在「系统设置 → 隐私与安全性」里允许）

> 依赖装不上时注意：Electron 二进制默认从 GitHub 下载，国内网络可先 `proxy-on`，
> 或设置 `ELECTRON_GET_USE_PROXY=1` / `ELECTRON_MIRROR` 镜像。

## 打包

Windows：

```bash
npm run dist        # 生成便携版（计划清单-x.y.z-portable.exe）
npm run dist:nsis   # 生成安装包（计划清单-x.y.z-setup.exe）
```

macOS（必须在 macOS 上执行）：

```bash
npm run dist:mac    # 生成 .dmg，架构与当前机器一致（Apple Silicon 出 arm64）
npm run test:mac    # macOS 功能自检（菜单/菜单栏图标/通知/快捷键/关闭到菜单栏…）
```

产物在 `dist/计划清单-x.y.z-<arch>.dmg`。未配置签名证书时打包会跳过签名，
第一次打开需要：右键 App →「打开」，或执行一次
`xattr -dr com.apple.quarantine /Applications/计划清单.app`。
换图标/重画图标后可执行 `python3 scripts/make-mac-icons.py` 重新生成 `build/icon.icns` 与菜单栏模板图。
发布流程与要求（Windows + macOS 安装包需同时上传、说明文件用 UTF-8）见 [docs/发布清单.md](docs/发布清单.md)。

## 数据

数据默认保存在用户目录，不在安装目录里，升级或重装不会覆盖：

- Windows：`%APPDATA%\jihua-qingdan\data.json`
- macOS：`~/Library/Application Support/jihua-qingdan/data.json`

可以在 设置 → 数据与备份 里查看路径、导入 `data.json`。

## 目录结构

```
src/main        Electron 主进程（窗口、托盘、提醒、同步、AI）
src/preload     预加载脚本（contextBridge 白名单）
src/renderer    React 界面
build           打包脚本、图标、安装器
scripts         端到端测试与本地 WebDAV / AI 模拟服务
docs            设计文档
```

## 说明

- 部分 Windows 环境里 Chromium 沙箱初始化会失败，便携版根目录的启动器会自动补上 `--no-sandbox` 参数。
- macOS 版关闭窗口只是收进菜单栏，退出请用 `⌘Q` 或菜单栏菜单里的「退出计划清单」。
- macOS 适配的详细改动与验证记录见 [docs/macOS-适配说明.md](docs/macOS-适配说明.md)。
