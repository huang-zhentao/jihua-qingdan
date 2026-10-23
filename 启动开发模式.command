#!/bin/zsh
# macOS 版「启动开发模式」：双击运行即可
# 首次使用前若提示没有权限，执行一次：chmod +x 启动开发模式.command

cd "$(dirname "$0")" || exit 1

if [ ! -d node_modules ]; then
  echo "[1/2] 安装依赖，请稍候…"
  # 国内网络下 Electron 二进制走 GitHub 常失败，可先 proxy-on 或设置 ELECTRON_MIRROR
  if ! npm install; then
    echo ""
    echo "依赖安装失败。可先执行 proxy-on，或设置 ELECTRON_MIRROR 镜像后重试。"
    read -r "?按回车键关闭窗口…"
    exit 1
  fi
fi

echo "[2/2] 启动开发模式…"
npm run dev
echo ""
echo "开发模式已退出。"
read -r "?按回车键关闭窗口…"
