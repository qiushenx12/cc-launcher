# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`claude-code-启动器` is a Windows desktop application built with **Tauri v2 + Vue 3 + Rust**. It provides a GUI for managing Claude Code environment configurations, AI sessions, and an embedded PTY terminal.

- **Frontend**: Vue 3 (Composition API), Pinia, TypeScript, Vite
- **Backend**: Rust, Tauri v2 commands
- **Target platform**: Windows only (uses `winreg` and `windows` crates)
- **Package manager**: npm

## Common Commands

Install dependencies after checkout (not stored in version control):

```bash
npm install
```

Development:

```bash
# Full Tauri dev mode (starts Vite + Rust backend with hot reload)
npm run tauri dev

# Frontend-only dev server (rarely useful; Tauri dev is the normal workflow)
npm run dev
```

Build:

```bash
# Frontend-only build
npm run build

# Full production build (produces exe + NSIS installer under src-tauri/target/release/bundle)
npm run tauri build
```

Type / compile checks:

```bash
# TypeScript type check
npx vue-tsc --noEmit

# Rust check
cd src-tauri && cargo check
```

There are no automated tests in this repository.

## Architecture

### Frontend

The Vue app mounts in `src/main.ts` and renders `src/App.vue`, which hosts the main tabs:

- **配置** — Claude Code configuration panel (`src/components/claude/`)
- **项目** — Project workspace with per-project sessions, embedded terminal, and a tool sidebar (`src/components/project/`)
- **终端** — Multi-tab PTY terminal (`src/components/terminal/`); kept mounted but switched to programmatically
- **编排** — Orchestration manager (`src/components/orchestration/`); kept mounted but switched to programmatically

State lives in Pinia stores under `src/stores/` (`claude.ts`, `project.ts`, `terminal.ts`, `tabComm.ts`). Components communicate with the Rust backend via Tauri `invoke()` calls and receive events for terminal output.

### Backend

Rust commands are registered in `src-tauri/src/lib.rs` under `invoke_handler`. Major modules:

- `config_store` — Load/save Claude Code config JSON
- `settings_manager` — Load/save launch settings
- `persistent_state` — Window size/position, pane widths, terminal font, config order
- `project_manager` — Load/save projects, sessions, and recent items; read/save text files
- `session_manager` — Scan Claude Code session history and recent projects
- `model_fetcher` — Fetch available Claude Code models from API
- `claude_launcher` — Locate and spawn Claude Code CLI process
- `registry` — Windows registry environment variable writes
- `pty` — PTY terminal sessions using `portable-pty`
- `tab_cli` — Inter-tab communication: permissions, snapshots, presets

All JSON user data is stored under `%APPDATA%\ClaudeEnvManager\`.

### Persistence & Data Flow

- Configs and settings are persisted through dedicated Tauri commands, not direct filesystem access from the frontend.
- The embedded terminal can launch Claude Code with the selected configuration; output streams back via Tauri events.
- Window state is saved on close in **logical pixels** (`size / scaleFactor`) and restored on launch.
- Inter-tab communication uses a custom `tab-*` command protocol routed through `tab_cli`.

### Keyboard Shortcuts

Defined in `src/App.vue`:

| Context | Shortcut | Action |
|---|---|---|
| Global | `Ctrl + W` | Close current terminal tab (when terminal tab is active) |
| Global | `Ctrl + Tab` | Switch terminal tabs (when terminal tab is active) |
| Project | `Ctrl + T` | New project session |
| Project | `Ctrl + W` | Close current project session terminal |
| Project | `Ctrl + Tab` | Switch project sessions |
| Project | `Ctrl + P` | Open file in sidebar |
| Project | `Ctrl + S` | Save current file in sidebar |
| Project | `Ctrl + Shift + B` | Toggle tool sidebar |

## Build Outputs

- Frontend build: `dist/`
- Rust build: `src-tauri/target/`
- Production installer: `src-tauri/target/release/bundle/nsis/`

Both `dist/` and `src-tauri/target/` are ignored in SVN. `node_modules/` is also ignored; always run `npm install` after a fresh checkout.

## Notes

- The application bundle is configured to produce an NSIS installer (`src-tauri/tauri.conf.json`).
- The Rust backend is Windows-specific; cross-platform compilation is not currently supported.
- No linting or formatting scripts are configured.

## Workflow Guidelines

- After making code changes, do not launch the dev server, browser, or Tauri app for verification. Instead, perform static checks (e.g., `npx vue-tsc --noEmit`, `cargo check`) and then ask the user to test directly.
