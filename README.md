# 计划清单

一个 Windows / macOS 桌面日历 + 待办应用，用 Electron + React + TypeScript 构建。

## 功能

- **月历**：农历、节气、节日、休班标记；年月快速跳转；「今」一键回到今天
- **任务**：右侧抽屉增删改；日期、项目分类、优先级、背景色；备注支持简单 Markdown
- **提醒**：按天提前 1–5 天，到点弹系统通知，点通知直接打开对应日程
- **待办视图**：左侧迷你日历（有任务的日期带灰点）、当天日程、按项目筛选
- **托盘常驻**：点关闭收进托盘；右键托盘图标可直接勾掉今天未完成的任务
- **搜索**：`Ctrl+K` 全局搜索任务
- **同步**：WebDAV（坚果云 / 群晖 / Nextcloud 等），自动同步间隔可选
- **AI 助手**：接入 OpenAI 兼容接口（默认 DeepSeek），对话式分析近期任务
- **深色模式**：浅色 / 深色 / 跟随系统

## 开发

```bash
npm install
npm run dev
```

## 打包

```bash
npm run dist        # 生成便携版
npm run dist:nsis   # 生成安装包
```

## 数据

数据默认保存在用户目录（`%APPDATA%\jihua-qingdan`），不在安装目录里，升级或重装不会覆盖。
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

部分环境里 Chromium 沙箱初始化会失败，便携版根目录的启动器会自动补上 `--no-sandbox` 参数。
