#!/bin/zsh

# Finder may launch this script with the user's home directory as cwd.
# Resolve every relative path from the script location instead.
PROJECT_DIR="${0:A:h}"
cd "$PROJECT_DIR" || {
  echo "无法进入项目目录：$PROJECT_DIR"
  read -r "?按回车键关闭窗口…"
  exit 1
}

pause_before_exit() {
  echo
  read -r "?按回车键关闭窗口…"
}

fail() {
  echo
  echo "构建未完成：$1"
  pause_before_exit
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "未找到 $1。$2"
}

echo "========================================"
echo " Agents Launcher macOS 构建"
echo "========================================"
echo "项目目录：$PROJECT_DIR"
echo

require_command node "请先安装 Node.js 20 或更高版本。"
require_command npm "请确认 Node.js 和 npm 已正确安装。"
require_command rustc "请先从 https://rustup.rs 安装 Rust。"
require_command cargo "请先从 https://rustup.rs 安装 Rust。"
require_command rustup "请确认 Rust 是通过 rustup 安装的。"
require_command xcode-select "请先执行 xcode-select --install。"

if ! xcode-select -p >/dev/null 2>&1; then
  fail "未检测到 Xcode Command Line Tools，请先执行 xcode-select --install。"
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null)"
if [[ ! "$NODE_MAJOR" =~ '^[0-9]+$' ]] || (( NODE_MAJOR < 20 )); then
  fail "当前 Node.js 版本为 $(node --version 2>/dev/null)，构建需要 Node.js 20 或更高版本。"
fi

case "$(uname -m)" in
  arm64)
    BUILD_TARGET="aarch64-apple-darwin"
    ;;
  x86_64)
    BUILD_TARGET="x86_64-apple-darwin"
    ;;
  *)
    fail "暂不支持当前处理器架构：$(uname -m)"
    ;;
esac

echo "Node.js：$(node --version)"
echo "Rust：$(rustc --version)"
echo "目标架构：$BUILD_TARGET"
echo

if ! rustup target list --installed | grep -Fxq "$BUILD_TARGET"; then
  echo "正在安装 Rust 目标：$BUILD_TARGET"
  rustup target add "$BUILD_TARGET" || fail "Rust 目标安装失败：$BUILD_TARGET"
fi

if [[ ! -d node_modules ]]; then
  echo "首次构建，正在安装 npm 依赖…"
  npm install || fail "npm 依赖安装失败。"
  echo
fi

echo "开始生成 .app 和 .dmg…"
echo

if npm run tauri build -- --target "$BUILD_TARGET" --bundles app,dmg; then
  BUNDLE_DIR="$PROJECT_DIR/src-tauri/target/$BUILD_TARGET/release/bundle"
  echo
  echo "构建成功。"
  echo "产物目录：$BUNDLE_DIR"
  if [[ -d "$BUNDLE_DIR" ]]; then
    open "$BUNDLE_DIR"
  fi
  pause_before_exit
  exit 0
else
  fail "Tauri 构建失败，请查看上方日志。"
fi
