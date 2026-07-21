# Development Environment Dependencies

This document describes the software required to develop, validate, and package Agents Launcher. Install application libraries through the repository lockfiles; do not install individual JavaScript or Rust packages manually.

## Required tools

| Tool | Requirement | Purpose |
| --- | --- | --- |
| Git | A current supported version | Clone the repository and manage source changes. |
| Node.js | Version 22 or newer; use an active LTS release | Run the Vue/Vite frontend, Tauri CLI, TypeScript checks, and Node-based tests. The packaged application's dependency gate accepts Node.js 18+, but contributors should use Node.js 22+ for the full development and test workflow. |
| npm | The version bundled with Node.js | Install and lock frontend dependencies. This repository uses npm and `package-lock.json`. |
| Rust | Current stable toolchain installed through `rustup` | Compile and test the Tauri backend. |
| Cargo | Bundled with Rust | Resolve the Rust dependencies pinned by `src-tauri/Cargo.lock` and run backend checks. |

Use the official installation sources:

- [Node.js downloads](https://nodejs.org/en/download)
- [Rust installation](https://www.rust-lang.org/tools/install)
- [Git downloads](https://git-scm.com/downloads)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Platform requirements

### Windows

Install the following components in addition to the required tools:

- Microsoft Visual Studio Build Tools with the **Desktop development with C++** workload.
- Microsoft Edge WebView2 Runtime. It is normally already present on current Windows versions.
- The Rust MSVC toolchain. Select MSVC during Rust installation or run:

```powershell
rustup default stable-msvc
```

Windows is required to build and validate the NSIS `.exe` installer.

### macOS

Install Xcode Command Line Tools for desktop development:

```bash
xcode-select --install
```

Use the native Rust toolchain for the Mac's architecture. macOS is required to build and validate the `.app` and `.dmg` bundles. The current bundle configuration targets macOS 13 or newer.

## Optional tools

| Tool | When it is needed |
| --- | --- |
| Python 3.10+ | Required for the versioned packaging workflow in `build.py` and `build-macos.command`; it is not required for normal `npm run tauri dev`. Use `python` on Windows and `python3` on macOS. |
| GitHub CLI (`gh`) | Required only when creating or updating GitHub Releases from the command line. |
| Claude Code, Codex, and OpenCode CLIs | Install the CLI integrations you are actively developing or testing. They are not compile-time dependencies. Follow each CLI's official installation instructions. |

## Verify the toolchain

Open a new terminal after installing or updating system tools, then run:

```text
git --version
node --version
npm --version
rustc --version
cargo --version
```

For release packaging, also verify Python:

```powershell
# Windows
python --version
```

```bash
# macOS
python3 --version
```

## Set up the repository

From the repository root:

```text
npm install
```

`npm install` restores the JavaScript dependencies from `package-lock.json`. Cargo downloads Rust dependencies automatically during the first Rust build or check.

Run the standard static checks:

```text
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Run the automated tests when relevant:

```text
node --test tests/codexTerminalOutput.test.ts
cargo test --manifest-path src-tauri/Cargo.toml
python -m unittest discover -s tests -p test_build_version.py -v
```

On macOS, use `python3` instead of `python` for the Python test command if necessary.

## Start development

Run the full desktop application with frontend and Rust hot reload:

```text
npm run tauri dev
```

Run only the frontend Vite server when Tauri integration is not needed:

```text
npm run dev
```

For versioned production packaging and release-state handling, follow [the build and release guide](./build.md).

## Dependency ownership

- JavaScript package versions are declared in `package.json` and pinned by `package-lock.json`.
- Rust crate versions are declared in `src-tauri/Cargo.toml` and pinned by `src-tauri/Cargo.lock`.
- Do not commit `node_modules/`, `dist/`, `src-tauri/target/`, generated installers, or local credentials.
- Run `npm install` again after pulling changes to `package-lock.json`.
- Run a Cargo check after pulling changes to `src-tauri/Cargo.toml` or `src-tauri/Cargo.lock`.
