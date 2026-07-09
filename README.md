# ClaudeCode 启动器

基于 **Tauri v2 + Vue 3 + Rust** 的 Windows 桌面应用，用于管理 **Claude Code** 的环境配置、AI 会话与内置终端。

轻量（~10MB）、高性能、无需 Electron。

## 核心功能

| 功能 | 说明 |
|---|---|
| **项目工作区** | 项目目录管理、多会话、右侧工具边栏（文件/浏览器/终端） |
| **多配置管理** | 创建/编辑/拖拽排序 Claude Code 的环境变量配置方案（API 地址、Token、模型等），JSON 持久化 |
| **内置终端** | xterm.js + Rust PTY，多标签页，支持直接在应用内运行 AI CLI |
| **跨标签页通信** | 终端内 `tab-*` CLI 命令，实现多 agent 标签页间直接通信（消息收发、输出读取、状态检测） |
| **权限管理** | 按标签页配置通信权限（是否启用、允许操作的目标标签页） |
| **终端快照** | 保存/读取终端状态（标签页权限配置），按项目路径绑定持久化 |
| **模型获取** | 从 API 拉取可用模型列表，支持模型选择与切换 |
| **会话管理** | 扫描历史会话，支持 `-r` 一键恢复；最近项目快速选择 |
| **启动选项** | `--dangerously-skip-permissions`、禁用离开摘要、内置/外部终端切换 |
| **环境变量应用** | 写入 Windows 注册表（用户/系统级别），带确认弹窗 |
| **窗口记忆** | 自动保存和恢复窗口大小、面板宽度、终端字体 |

## 目录导航

- [快速开始](#快速开始)
- [架构](#架构)
- [项目结构](#项目结构)
- [Rust 后端命令](#rust-后端命令)
- [快捷键](#快捷键)
- [配置存储](#配置存储)

## 快速开始

项目已将 `node_modules` 从版本库移除，首次拉取代码后需要先安装依赖：

```bash
npm install
npm run tauri dev      # 开发模式（热更新）
npm run tauri build    # 生产构建
```

详细构建指南见 [BUILD.md](./BUILD.md)。

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    前端 (Vue 3)                      │
│  配置 Tab: Claude Code 面板                          │
│  项目 Tab: 项目工作区（会话/终端/工具边栏）           │
│  终端 Tab: 多标签 PTY 终端管理                        │
│  编排 Tab: 多 Agent 编排与角色/预设管理               │
│  Store: claude.ts / project.ts / terminal.ts / tabComm.ts │
├─────────────────────────────────────────────────────┤
│              Tauri IPC 层 (invoke 命令 + 事件)       │
├─────────────────────────────────────────────────────┤
│                    后端 (Rust)                        │
│  config_store      配置 JSON 持久化                   │
│  settings_manager  启动设置管理                       │
│  persistent_state  窗口状态/目录记忆/排序/字体        │
│  project_manager   项目、会话、最近项、文本文件       │
│  model_fetcher     Claude 模型 API 拉取               │
│  session_manager   Claude 会话扫描 + 最近项目         │
│  claude_launcher   查找并启动 Claude CLI (内置/外部)   │
│  pty/              PTY 多标签终端管理 + OSC 标题解析   │
│  tab_cli           跨标签页通信: tab-* 命令解析/路由/权限 │
│  registry          Windows 注册表环境变量读写           │
│  utils             配置目录获取/打开文件夹/环境变量     │
└─────────────────────────────────────────────────────┘
```

### 启动数据流

```
用户点击"启动" → claudeStore.launchClaude()
  → 组装命令: [claude.exe, ...args] + 环境变量
  → 项目工作区: 创建/激活项目与会话 → projectStore.ensureSessionTerminal()
     → invoke('pty_create') → Rust PTY → 'pty_output' 事件 → xterm.js 渲染
  → 外部终端: invoke('launch_claude') → Rust spawn 独立窗口
  → 终端 Tab: 直接创建 Rust PTY 标签页，独立管理多终端会话
```

## 项目结构

```
claude-launcher/
├── src/                       # Vue 3 前端
│   ├── App.vue                # 根组件 (导航: 配置/项目/终端/编排 Tab, 快捷键, 窗口记忆)
│   ├── main.ts                # 入口
│   ├── components/
│   │   ├── claude/            # Claude Code 配置面板
│   │   │   ├── ClaudePanel.vue      # 面板总控
│   │   │   ├── ConfigList.vue       # 配置列表 (拖拽排序)
│   │   │   ├── ConfigEditor.vue     # 配置编辑器
│   │   │   ├── ModelField.vue       # 模型选择器
│   │   │   ├── TokenField.vue       # Token 输入
│   │   │   ├── SessionList.vue      # 历史会话
│   │   │   └── LaunchOptions.vue    # 启动选项
│   │   ├── project/           # 项目工作区
│   │   │   ├── ProjectPanel.vue     # 项目面板总控 (三栏布局)
│   │   │   ├── ProjectSidebar.vue   # 左侧项目/会话树
│   │   │   ├── ProjectTerminalArea.vue  # 中间终端区域
│   │   │   ├── RightSidebar.vue     # 右侧工具边栏
│   │   │   └── ModuleToolbar.vue    # 工具栏
│   │   ├── terminal/          # 终端组件
│   │   │   ├── TerminalManager.vue  # 终端容器 (布局/权限按钮/快照)
│   │   │   ├── TerminalTab.vue      # 标签页 UI
│   │   │   ├── TerminalPane.vue     # xterm.js 实例
│   │   │   ├── TabPermissionModal.vue  # 通信权限配置弹窗
│   │   │   └── SnapshotManager.vue     # 终端快照管理弹窗
│   │   ├── orchestration/     # 编排组件
│   │   │   ├── OrchestrationManager.vue  # 编排面板总控
│   │   │   ├── AgentRoleModal.vue        # Agent 角色管理弹窗
│   │   │   └── PresetManager.vue         # 编排预设管理弹窗
│   │   └── common/            # 通用组件
│   │       ├── SectionCard.vue        # （当前未引用）
│   │       ├── StatusBar.vue
│   │       └── ToastNotification.vue  # 全局轻提示
│   ├── stores/                # Pinia 状态管理
│   │   ├── claude.ts          # Claude 配置/会话/启动
│   │   ├── project.ts         # 项目、会话、工具边栏
│   │   ├── terminal.ts        # PTY 标签页/输出缓冲/活跃追踪
│   │   └── tabComm.ts         # 跨标签页通信: 权限/快照/modal 状态
│   ├── composables/
│   │   ├── usePtyBridge.ts    # PTY 通信桥接
│   │   ├── useResizablePanes.ts   # Claude 面板左右分栏拖拽
│   │   ├── useResizableDivider.ts # 项目面板左右分栏拖拽
│   │   ├── useTauriDrop.ts    # 侧边栏拖拽文件/目录处理
│   │   └── useDragReorder.ts  # 拖拽排序
│   ├── types/
│   │   ├── config.ts          # EnvConfig, ClaudeSettings, SessionEntry
│   │   ├── terminal.ts        # TerminalTab, PtyOutput, PtyTitle
│   │   └── orchestration.ts   # OrchestrationAgent, OrchestrationPreset
│   └── assets/styles/         # theme.css + components.css
├── src-tauri/                 # Rust 后端 (Tauri v2)
│   ├── src/
│   │   ├── main.rs            # 应用入口
│   │   ├── lib.rs             # Tauri 命令注册
│   │   ├── config_store.rs    # 配置 JSON 持久化
│   │   ├── settings_manager.rs
│   │   ├── persistent_state.rs
│   │   ├── project_manager.rs
│   │   ├── model_fetcher.rs
│   │   ├── session_manager.rs
│   │   ├── claude_launcher.rs
│   │   ├── pty/               # PTY 管理 (mod.rs + session.rs)
│   │   ├── tab_cli.rs         # 跨标签页通信: tab-* 命令解析/路由/权限/快照
│   │   ├── registry.rs        # Windows 注册表
│   │   └── utils.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/          # Tauri 权限配置
├── docs/                      # 技术文档
├── package.json
├── vite.config.ts
├── BUILD.md                   # 构建指南
└── 公告板.md                  # 迭代需求与规划
```

## Rust 后端命令

前端通过 `invoke()` 调用：

| 分类 | 命令 |
|---|---|
| **配置** | `load/save_claude_configs` |
| **注册表** | `apply_env_vars` |
| **设置** | `load/save_claude_settings` |
| **状态持久化** | `load/save_window_state`, `load/save_launch_dir`, `load/save_terminal_font_size`, `load/save_pane_width`, `load/save_config_order`, `load/save_use_builtin_terminal`, `load/save_last_active_main_tab` |
| **窗口主题** | `set_titlebar_theme` |
| **项目** | `load/save_projects`, `path_kind`, `read_text_file`, `save_text_file` |
| **模型** | `fetch_claude_models` |
| **会话** | `load_claude_sessions`, `load_claude_recent_projects` |
| **启动** | `launch_claude`, `find_claude_executable` |
| **工具** | `get_claude_config_dir`, `open_directory`, `open_env_vars_dialog`, `get_current_env_vars` |
| **PTY** | `pty_create`, `pty_write`, `pty_resize`, `pty_kill` |
| **跨标签页通信** | `set_tab_permission`, `get_tab_permission`, `save_terminal_snapshot`, `load_terminal_snapshot`, `list_terminal_snapshots`, `list_presets`, `save_preset`, `delete_preset`, `load_preset` |

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl + T` | 新建终端标签页（项目模式下：新建项目会话） |
| `Ctrl + W` | 关闭当前终端标签页（项目模式下：关闭当前项目会话终端） |
| `Ctrl + Tab` | 切换终端标签页（项目模式下：切换项目会话） |
| `Ctrl + P` | 项目模式下：在侧边栏打开文件 |
| `Ctrl + S` | 项目模式下：保存当前侧边栏文件 |
| `Ctrl + Shift + B` | 项目模式下：展开/收起工具边栏 |

## 配置存储

所有配置保存在 `%APPDATA%\ClaudeEnvManager\`：

- `env_configs.json` — Claude Code 环境变量配置
- `projects.json` — 项目工作区的项目、会话、展开状态等
- `settings.json` — 启动选项、窗口状态、字体大小等
