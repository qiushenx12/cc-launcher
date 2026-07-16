# Agents Launcher (Tauri Edition) — 构建与运行指南

## 环境要求

- **Node.js** >= 18
- **Rust** >= 1.70 (stable-x86_64-pc-windows-msvc)
- **Visual Studio Build Tools** (含 C++ 桌面开发工作负载)
- **WebView2** (Windows 10/11 已预装)

## 安装依赖

```bash
cd agents-launcher

# 安装前端依赖
npm install
```

Rust 依赖会在首次编译时自动下载。如果下载慢，设置国内镜像：

```bash
# ~/.cargo/config.toml
[source.crates-io]
replace-with = "ustc"

[source.ustc]
registry = "sparse+https://mirrors.ustc.edu.cn/crates.io-index/"
```

## 开发模式

```bash
npm run tauri dev
```

这会同时启动 Vite 开发服务器（前端热更新）和 Rust 后端编译。首次编译约 2-5 分钟，后续增量编译几秒。

开发模式下：
- 前端修改实时热更新
- Rust 修改自动重新编译并重启
- 打开 DevTools：右键页面 → 检查

## 生产构建

```bash
npm run tauri build
```

### 产物位置

```
agents-launcher/
└── src-tauri/
    └── target/
        └── release/
            ├── agents-launcher.exe           ← 可执行文件（可直接运行）
            └── bundle/
                └── nsis/
                    └── Agents Launcher_1.0.0_x64-setup.exe   ← NSIS 安装包
```

| 产物 | 路径 | 说明 |
|------|------|------|
| 裸 exe | `src-tauri/target/release/agents-launcher.exe` | 可直接运行，但不含 WebView2 引导安装 |
| NSIS 安装包 | `src-tauri/target/release/bundle/nsis/` | 推荐分发方式，含安装/卸载、开始菜单快捷方式 |

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run tauri dev` | 开发模式（热更新） |
| `npm run tauri build` | 生产构建 |
| `npm run tauri build -- --debug` | 带调试信息的构建 |
| `npm run build` | 仅构建前端（不含 Rust） |
| `cd src-tauri && cargo check` | 仅检查 Rust 编译 |
| `npx vue-tsc --noEmit` | TypeScript 类型检查 |

## Rust 镜像加速（可选）

Rust 工具链安装加速：

```bash
export RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static
export RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup
```

## 注意事项

- 首次 `cargo tauri build` 会下载并编译所有 Rust 依赖，耗时较长（5-15 分钟）
- 构建需要 MSVC 工具链，不支持 MinGW (GNU) 目标
- NSIS 安装包默认安装到当前用户目录，无需管理员权限
- 安装包语言为简体中文
