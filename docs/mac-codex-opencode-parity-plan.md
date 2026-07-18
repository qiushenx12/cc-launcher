# macOS Codex / OpenCode 功能追平规划

> 创建日期：2026-07-17  
> 当前分支：`mac-from-main`  
> 对齐基线：`origin/main`（`b00b8e7`）及当前 macOS 工作树  
> 目标平台：macOS  
> 状态：P0/P1/P2 自动实施与检查已完成，等待 macOS 交互验收

## 1. 文档目的

当前分支已经完成远程主干与原 macOS 适配分支的代码合并。主干中的三 CLI 架构、Codex/OpenCode 配置页面、项目与会话发现、终端启动、配置事务和测试文件均已恢复。

因此，后续工作不再以“补回主干文件”为目标，而是验证并补齐这些功能在 macOS 上的真实运行能力，使 macOS 版本在 Codex 和 OpenCode 两条链路上达到与主干 Windows 版本相同的功能边界和安全标准。

`docs/mac-local-vs-remote-main-diff.md` 记录的是合并前差异，仅作为历史背景，不再作为当前任务清单。

## 2. 当前基线

### 2.1 已合并能力

- Claude、Codex、OpenCode 使用独立 `CliKind`，项目、会话、活动配置和持久化状态相互隔离。
- Codex 已具备：
  - CLI 检测和能力探测。
  - 官方登录状态只读检查。
  - 独立 `<profile>.config.toml` 管理。
  - 官方/第三方 Provider、模型、推理强度和模型列表获取。
  - 启动器活动方案与可选全局同步。
  - `.codex/sessions` 项目发现、App Server 会话列表和精确恢复。
- OpenCode 已具备：
  - CLI 检测和版本探测。
  - 直接读取、修改全局 `opencode.jsonc`/`opencode.json`。
  - 自定义 Provider、默认模型、Small model、模型输入能力和模型 limit 管理。
  - 原生 `auth.json` API Key、启用和禁用状态管理。
  - `debug config --pure` 启动前配置解析。
  - 项目发现、会话列表和原生会话恢复。
- 配置写入具有 revision 检查、临时文件、备份、回读校验和未知字段保留机制。
- 前端构建、Node 终端测试和 Rust 单元测试已能在当前 macOS 工作树通过。

### 2.2 本机 CLI 能力

当前开发机已检测到：

- Codex：`codex-cli 0.144.5`，支持 `--profile`、`-C`、`resume`、`app-server` 和 `--no-alt-screen`。
- OpenCode：`1.18.3`，支持 JSON 会话列表、`debug config --pure`，其 macOS 数据路径为：
  - 配置：`~/.config/opencode`
  - 数据：`~/.local/share/opencode`
  - 状态：`~/.local/state/opencode`

这些版本高于主干开发文档记录的 Codex `0.144.4` 和 OpenCode `1.17.20`，现有能力探测仍然匹配。

## 3. 实施前功能差异

| 领域 | Codex | OpenCode | 实施前结论 |
| --- | --- | --- | --- |
| CLI 路径检测 | 当前工作树已补常见 macOS、Homebrew 和 Node 版本管理器路径 | 同左 | 代码可用，但关键改动尚未提交 |
| CLI 版本/能力探测 | 本机通过 | 版本通过 | 基本追平 |
| 官方/原生认证 | 只读复用 `~/.codex/auth.json` | 读取原生 `auth.json` | 基本追平 |
| 官方配置 | 独立 profile、启动器应用、全局 TOML 同步可工作 | 不适用 | 待交互验收 |
| 第三方 Key 获取模型 | 当前输入 Key 可用 | 当前输入或配置 Key 可用 | 基本追平 |
| 第三方 Key 持久化 | 仅实现 Windows DPAPI，macOS 保存失败 | 写入 OpenCode 原生 `auth.json` | Codex 未追平 |
| 第三方启动注入 | 只能依赖当前进程已有环境变量 | 由 OpenCode 原生配置解析 | Codex 未追平 |
| 第三方全局同步 | 仍读取 Windows 注册表，macOS 必然失败 | 直接同步全局 JSONC | Codex 未追平 |
| 项目/会话发现 | Unix 路径通常可用 | 普通项目可用，全局项目探测仍有 Windows 根目录假设 | 部分追平 |
| 终端输入 | 仍对所有平台执行 Windows ConPTY 特殊编码 | 未发现同类问题 | Codex 存在阻断风险 |
| 密钥文件权限 | 等待 Keychain 方案 | 原子写入未强制 `0600` | 均需补安全边界 |
| UI 文案/快捷键 | 仍显示 DPAPI、`%APPDATA%`、Windows 环境变量，快捷键仍以 Ctrl 为主 | 默认路径仍出现 Windows 示例 | 未平台化 |

### 3.1 自动实施结果

截至 2026-07-17，以上差异已经完成代码处置：

- CLI 检测、能力探测、OpenCode 子命令和 PTY 子进程统一使用 macOS effective PATH，覆盖 Homebrew 和常见 Node 版本管理器路径。
- Codex 的 Windows ConPTY 输入编码和 `disable_paste_burst` 已限制在 Windows；macOS 输入保持 UTF-8 原样透传。
- Codex 第三方 Key 已接入 macOS Keychain，并按 profile ID 隔离；配置页以固定掩码显示“已保存”状态，只有用户点击“显示”时才按需从 Keychain 读取明文到当前表单内存。第三方 Provider 和模型可以同步到用户级全局 TOML；有已保存 Key 时使用 Codex 官方支持的命令式认证按需从 Keychain 读取，Key 本身不写入 TOML、shell 或 LaunchAgent。
- OpenCode 全局项目改用 Unix 根目录和区分大小写的路径 key；凭据文件及包含明文 Key 的配置、临时文件和备份按当前用户私有权限写入。
- macOS 配置文案、默认路径、安装提示和主快捷键已平台化。
- Codex 全局同步勾选状态从持久化的 `globalProfileId` 恢复；全局 TOML 与当前 profile 不一致时显示“全局待更新”，并允许直接重新同步，避免仅按 profile ID 误判按钮状态。
- 前端构建、Node 终端测试、Rust 单元测试和 `cargo check` 已通过；真实 Keychain、Finder 启动、CLI 会话与本机配置写入留给人工验收。

## 4. 目标状态

### 4.1 Codex 完成标准

1. Finder 启动的打包应用可以检测并启动 Homebrew、npm、nvm、fnm、Volta 等常见来源安装的 Codex。
2. 官方登录方案可以保存、应用、启动新会话和恢复历史会话，且不修改 `auth.json`。
3. 第三方方案的 Key 使用 macOS Keychain 或等价的当前用户安全存储，不在 TOML、方案 JSON、日志或诊断中出现明文。
4. 启动器内启动 Codex 时，已保存 Key 的方案通过 Codex 命令式认证按需读取 Keychain；没有保存 Key 时才从启动器进程现有环境变量注入目标 PTY。
5. 对“同步到全局”的第三方方案拆分配置与密钥语义：允许把 Provider 和模型写入用户级 `~/.codex/config.toml`；有已保存 Key 时写入不含明文的命令式认证配置，由 Codex 调用 macOS 系统凭据工具从 Keychain 读取。没有已保存 Key 时保留 `env_key` 语义并要求用户提供对应环境变量，不能静默写入 Claude 配置或 shell 文件。
6. macOS Codex 终端不发送 Windows ConPTY 输入记录，中文、智能引号、粘贴、复制和 IME 输入正常。
7. 项目发现、App Server 会话列表、新建、精确恢复和原生恢复均能在 Unix 路径下工作。

### 4.2 OpenCode 完成标准

1. Finder 启动的打包应用可以检测并启动常见来源安装的 OpenCode。
2. 配置页直接读写本机真实 `~/.config/opencode/opencode.jsonc` 或 `opencode.json`。
3. Provider、模型、limit、Text/Image、默认模型和 Small model 保存后，不丢失内置 Provider、插件、shell、未知字段和未管理模型字段。
4. API Key、启用、禁用和 revision 冲突保护可正常工作；OAuth 或非 API Key 凭据不被修改。
5. 新创建的 `auth.json` 权限为 `0600`，原子替换后保留安全权限。
6. `debug config --pure` 在目标项目目录成功后才创建 PTY；失败时返回脱敏错误。
7. 普通项目和全局项目的发现、会话列表与恢复在 Unix 路径下正确工作，不进行 Windows 式大小写和分隔符归一化。

## 5. 实施计划

### P0-A：固化 macOS CLI 运行环境

目标：确保 Finder 启动、开发启动和 PTY 子进程使用一致的可执行文件搜索路径。

- 审核并提交当前 `platform_env` 实现。
- CLI 检测、版本探测、OpenCode 子命令、依赖检测和 PTY 启动统一使用同一份 effective PATH。
- 覆盖 Homebrew Intel/Apple Silicon、`~/.local/bin`、Volta、asdf、mise、npm global、pnpm、bun、nvm 和 fnm。
- nvm/fnm 版本选择使用语义版本或当前别名，不依赖字符串倒序。
- 增加 macOS PATH 构造测试。

验收：从 Finder 启动打包应用，Codex/OpenCode 检测结果与交互式终端一致。

### P0-B：隔离 Codex 的 Windows 终端兼容逻辑

目标：阻止 Windows ConPTY 修复污染 macOS Unix PTY。

- `encodeCodexConptyInput` 仅在 Windows Codex 终端启用。
- `disable_paste_burst=true` 仅在确有需要的平台启用。
- 保留通用的 Codex 同步输出帧稳定逻辑，但分别验证 macOS 正常屏幕和备用屏幕行为。
- 增加 macOS 输入透传测试，覆盖中文、智能引号、组合输入和 bracketed paste。

验收：智能引号原样输入，中文 IME、复制粘贴和光标显示无异常。

### P0-C：实现 Codex macOS 安全凭据后端

目标：让第三方 Codex profile 在 macOS 上可保存、应用和启动。

- 抽象 `protect_secret`/`unprotect_secret` 为平台凭据接口。
- Windows 保持 DPAPI；macOS 使用 Keychain。
- 凭据按 profile ID 隔离，并为服务名、账户名和删除行为定义稳定规则。
- 保存、删除、回滚和回读校验覆盖 Keychain 写入失败场景。
- 诊断输出只返回“是否存在凭据”，不返回 Keychain 内容。

验收：保存后磁盘上无明文 Key；重启应用后可正常启动第三方 Codex；删除方案后对应 Keychain 项被删除。

### P0-D：定义 Codex macOS 全局同步语义

目标：替换 Windows Registry 依赖，避免误写 Claude 配置。

- 将用户环境变量读取、写入和回滚从 `registry` 中抽象出来。
- 禁止把 Codex 环境变量写入 `~/.claude/settings.json`。
- 评估 macOS 的实现边界：
  - 启动器内使用：有已保存 Key 时同样采用 Codex 命令式认证，没有已保存 Key 时采用 PTY 子进程环境变量注入。
  - 外部 CLI/桌面端使用：采用 Codex Provider 的命令式认证，通过 macOS 系统凭据工具按 profile ID 读取 Keychain；不写入 LaunchAgent、`launchctl` 或 shell 配置。
- macOS UI 允许第三方“同步到全局”，并明确说明 TOML 只包含 Provider、模型和 Keychain 凭据定位信息，不包含 Key 明文；首次由外部 Codex 读取时可能触发 macOS Keychain 授权。

验收：第三方 Provider 配置可以写入并回读全局 TOML；外部 Codex 不再报 `Missing environment variable`，且 Key 不出现在 TOML、Claude 配置或启动器管理的 shell 环境中，也不会留下无法回滚的环境变量。

### P1-A：修复 OpenCode macOS 项目与路径处理

目标：让项目发现与历史恢复遵循 Unix 路径语义。

- macOS 全局项目探测目录使用 `/`，Windows 继续使用系统盘根目录。
- 错误提示改为平台无关文案。
- 路径比较按平台实现：Windows 忽略大小写和分隔符，macOS 保留原生分隔符，并兼容区分大小写的卷。
- 同步修复 Rust 运行时和项目持久化层中的路径 key。
- 新增 Unix 路径、根目录、空格、Unicode 和大小写差异测试。

验收：OpenCode 全局项目可展开为真实会话目录，不会错误合并大小写不同的路径。

### P1-B：加强 OpenCode Unix 文件权限

目标：保证原生明文凭据文件只允许当前用户读取。

- `auth.json` 新建权限设为 `0600`。
- 原子替换继承原文件权限；备份和临时文件使用相同或更严格权限。
- 配置文件若包含明文 `options.apiKey`，界面给出明确警告，并评估是否同步收紧为 `0600`。
- 增加 Unix 文件 mode 测试。

验收：保存和更新 Key 前后，`auth.json` 始终为当前用户私有文件。

### P2：平台化 UI、文案与快捷键

- Codex macOS 页面显示 Keychain，而不是 DPAPI。
- 路径回退示例使用 `~/Library/Application Support/ClaudeEnvManager`、`~/.codex` 和 `~/.config/opencode`。
- macOS 主快捷键使用 Command，终端内仍保留符合 CLI 习惯的 Control 信号行为。
- 安装说明补充 Homebrew/npm 来源和应用重启提示。
- 诊断信息增加平台、实际 CLI 路径和配置来源，不展示密钥值。

## 6. 测试与验收矩阵

### 6.1 自动检查

每个实施批次至少运行：

```bash
npm run build
node --test tests/codexTerminalInput.test.ts tests/codexTerminalOutput.test.ts
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

涉及跨层命令或 Tauri 注册时，补充：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

需要新增的 macOS 自动测试：

- Finder 风格最小 PATH 下的 CLI 定位。
- Codex macOS 输入原样透传。
- Keychain 保存、读取、删除和回滚接口测试。
- OpenCode Unix 路径归一化和全局项目展开。
- `auth.json`、临时文件和备份文件权限。
- 平台专属 UI 文案与能力开关。

### 6.2 人工验收

按以下顺序执行，避免同时修改真实配置后难以定位问题：

1. Finder 启动应用，确认 Node.js、Git、Codex 和 OpenCode 均能被检测。
2. Codex 官方方案：保存、应用、新会话、精确恢复、原生恢复。
3. Codex 第三方方案：获取模型、保存 Key、重启应用后确认输入框显示固定掩码；点击“显示”确认可从 Keychain 读取真实 Key，再验证隐藏、修改、保存、启动会话和删除方案。
4. Codex 中文、智能引号、复制、粘贴和 IME 输入。
5. OpenCode 空配置读取和首次保存。
6. OpenCode Provider、模型、limit、Text/Image、Key、启用和禁用。
7. 外部修改 JSONC/auth 后验证 revision 冲突保护。
8. OpenCode 普通项目、全局项目、会话列表与恢复。
9. 检查配置文件、凭据文件、备份文件和日志中不存在意外泄漏的 Key。

## 7. 已解决的 OpenCode 首次目录权限问题

开发过程中曾出现以下 OpenCode 专属目录不可写，导致首次配置保存和启动前预检失败：

- `~/.config/opencode`
- `~/.local/share/opencode`
- `~/.local/state/opencode`

这会导致：

- 配置页面可以构造空配置，但首次保存失败。
- `opencode debug config --pure` 无法创建日志。
- 项目发现、会话列表和启动前预检失败。

该问题已经纳入首次使用引导，不再作为当前阻塞。OpenCode 配置页会在首次进入时检查这三个专属目录；如果目录不可写或不属于当前用户，会直接说明原因并显示“一键修复权限”。点击后由 macOS 显示管理员授权窗口，启动器只创建或调整上述三个 OpenCode 目录，修复后使用 macOS 可用的目录测试命令自动回读验证。若用户取消授权，界面保留当前输入并提示重新操作，不会静默失败或修改整个用户目录。

## 8. 交付拆分建议

建议按可独立回归的提交拆分：

1. `fix(mac): unify cli discovery and child process path`
2. `fix(mac): keep Windows Codex terminal encoding off Unix PTYs`
3. `feat(mac): store Codex profile secrets in Keychain`
4. `feat(mac): define Codex global environment behavior`
5. `fix(mac): use Unix path semantics for OpenCode discovery`
6. `fix(mac): protect OpenCode credential file permissions`
7. `fix(mac): localize CLI configuration UI and shortcuts`
8. `test(mac): add Codex and OpenCode parity coverage`

每个提交应保持 Windows 现有行为不变，并避免混入图标、文档之外的无关格式化或生成文件。

## 9. 暂不纳入范围

- 不改变主干已经确定的三 CLI 隔离契约。
- 不迁移或合并 Codex、OpenCode、Claude 之间的原生会话 ID。
- 不解析、迁移或覆盖 Codex OAuth Token。
- 不修改 OpenCode OAuth 或非 API Key 类型凭据。
- 不自动修改用户 shell profile，除非后续方案明确授权、备份和回滚边界。
- 不在本规划中重构与 Codex/OpenCode macOS 追平无关的窗口、美术资源或编排功能。

## 10. 完成判定

满足以下条件后，可将本规划标记为完成：

- P0、P1 项全部实现并通过自动检查。
- Finder 启动的打包应用完成人工验收。
- Codex 官方和第三方方案均可在 macOS 上完成保存、应用、启动与恢复。
- OpenCode 配置、凭据、项目发现和会话恢复完整可用。
- macOS 不再调用 Windows Registry、DPAPI 或 ConPTY 专属路径。
- 凭据不以非预期明文形式出现在启动器数据、日志、诊断、临时文件或宽松权限文件中。
- Windows 原有 Codex/OpenCode 行为和测试没有回归。

截至 2026-07-17，以上自动实施项及静态/单元测试已完成；Finder 启动、真实 Keychain 授权、CLI 交互和本机 OpenCode 配置目录仍按第 6.2、7 节由用户验收。
