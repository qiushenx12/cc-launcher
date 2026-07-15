# 阶段 A：基线契约与迁移审计

> 审计日期：2026-07-14
> 范围：`三CLI入口与配置功能开发规划.md` 的阶段 A，以及阶段 B 已有代码的静态审核。
> 安全边界：本阶段只读取并统计 `%APPDATA%\ClaudeEnvManager\` 的结构，不记录配置值、项目路径、会话标题或凭据；不自动改写用户数据。

## 1. 阶段 A 交付物

| 交付物 | 位置 | 作用 |
| --- | --- | --- |
| 单一 CLI 契约 | `contracts/cli-contract.json` | 固定 `CliKind`、显示名、命令、配置格式、主 Tab 兼容规则、错误码、状态和三 CLI 中文提示。 |
| 前端类型封装 | `src/types/cli.ts` | 提供 `CliKind`、`CliDescriptor`、`CliStatus`、`MainTab`、描述表和旧 Tab 归一化函数。 |
| Rust 契约 | `src-tauri/src/cli_contract.rs` | 强类型解析同一份 JSON 契约，并通过 `get_cli_contract` 暴露同一序列化结果。 |
| 迁移预演 | `src-tauri/src/cli_migration.rs` | 以纯函数验证旧 Tab、缺失 `cliKind`、旧配置归属、未知字段保留和中断写入恢复选择；不执行磁盘写入。 |
| 能力输出解析 | `src-tauri/src/cli_capabilities.rs` | 固定 OpenCode 项目/会话 JSON 的最小受检结构，并读取 CodeX/OpenCode 能力夹具。 |
| 测试夹具 | `src-tauri/tests/fixtures/` | 保存脱敏迁移样本、能力探针结论、OpenCode 输出样例和 JSON Schema。 |

应用内持久化字段统一使用 `cliKind`（camelCase）；Rust 字段名使用 `cli_kind`，通过 Serde 转成前端格式。内部值只允许 `claude | codex | opencode`。

## 2. 现有应用数据盘点

2026-07-14 对 `%APPDATA%\ClaudeEnvManager\` 做了只读、脱敏盘点。当时只有以下三个文件，没有发现子目录或旧版拆分状态文件：

| 文件 | 实际结构 | 迁移结论 |
| --- | --- | --- |
| `app_state.json` | `window`、`claude`、`terminal`、`last_active_main_tab` | `project` 兼容映射为 `claude`；已知新值保留；未知值回退 `config`。 |
| `env_configs.json` | 根节点为 6 个命名方案；每个方案是字符串环境变量映射，包含敏感认证字段 | 所有无 CLI 元数据的旧方案归属 `claude`；迁移日志不得输出名称或值。 |
| `projects.json` | 7 个项目、49 个会话；项目和会话均为 camelCase JSON | 7 个项目和 49 个会话全部缺少 `cliKind`，均应补为 `claude`；已有合法 `cliKind` 时不得覆盖。 |

当前数据没有根级未知项目字段，但迁移夹具仍覆盖了项目、会话和根节点未知字段，以防后续版本或手工扩展字段被删除。

## 3. 可复现迁移与回滚规则

1. 迁移必须先完整读取并解析 `app_state.json`、`projects.json` 和 `env_configs.json`；任一文件不可解析时停止，不写任何目标文件。
2. 首次实际迁移前，在应用数据目录创建带时间戳的备份集，记录源文件哈希和迁移契约版本。三个文件必须属于同一备份批次。
3. 新内容先写到目标文件同目录的临时文件，完成 JSON 校验和刷新后再替换。未完成提交的临时文件永远不能自动晋升为正式文件。
4. 提交失败时优先继续使用原文件；原文件已经丢失时才使用已验证备份。没有原文件和备份时返回明确错误，不根据临时文件猜测恢复。
5. 迁移必须幂等：第二次执行不再新增字段，也不改变已经带合法 `cliKind` 的记录。
6. 回滚恢复同一备份批次的全部文件，不能只恢复项目文件而保留已经迁移的状态或配置索引。

阶段 A 只实现并测试上述数据变换和恢复选择，不接入 `load_projects` / `save_projects` 的真实写入路径。实际落盘应在阶段 B 接线时完成。

## 4. 统一状态契约

| 错误码 | 状态 | UI 行为 |
| --- | --- | --- |
| `executable_missing` | `blocked` | 只覆盖当前 CLI 工作区，显示安装说明、重新检测和返回配置。 |
| `version_command_failed` | `blocked` | 可执行文件存在但不能运行；提示检查权限和 PATH，不误报为未安装。 |
| `version_too_old` | `blocked` | 显示手动升级说明；应用不替用户自动升级。 |
| `config_parse_failed` | `blocked` | 保留原文件与表单输入，显示对应 JSON/TOML/JSONC 错误。 |
| `authentication_missing` | `blocked` | 按 Claude Code Token、CodeX 登录/API Key、OpenCode 提供商登录/受管 Key 分别提示。 |
| `provider_unreachable` | `degraded` | 不清空已保存方案，提示检查网络、端点和凭据。 |

三套 CLI 的完整中文提示以 `contracts/cli-contract.json` 为唯一来源，前端和 Rust 后端不再各自复制一套文本。

## 5. 目标 CLI 能力复核

### 5.1 CodeX

本次 PowerShell 将 `codex` 解析到 Codex 桌面应用的 WindowsApps 内置资源，但以下探针均在创建进程时返回 `Access is denied`：

- `codex --version`
- `codex --help`
- `codex resume --help`
- `codex -C <PROJECT_DIR> --version`
- `codex -C <PROJECT_DIR> resume --help`

因此阶段 A 当时基于 `codex-cli 0.141.0` 得出的 `-C`、`resume`、`--all` 结论不能标记为当次已重新验证；该失败样本继续用于验证 `version_command_failed`。阶段 B 后续使用 npm `codex-cli 0.144.4` 补充验证了 `-C`、`resume` 与公开 App Server `thread/list`，并确认 Windows 桌面任务可按 `cwd` 结构化返回；实现仍需保留阶段 A 的失败降级路径。

脱敏探针结论保存在 `src-tauri/tests/fixtures/cli/codex-capabilities-2026-07-14.json`。

### 5.2 OpenCode

本机版本已从规划记录的 1.17.18 更新为 **1.17.20**。本次复核结果：

| 能力 | 结果 |
| --- | --- |
| `opencode --version` | 成功返回 `1.17.20`。 |
| `opencode debug scrap` | 成功返回项目数组，含 `id`、`worktree`、`time`、`sandboxes`，`vcs` / `icon` 为可选扩展字段。 |
| `opencode session list --format json --max-count 3` | 成功返回会话数组，含 `id`、`title`、`created`、`updated`、`projectId`、`directory`。 |
| `opencode <PROJECT_DIR> --session <SESSION_ID>` | 根帮助仍声明项目目录位置参数和 `--session` 恢复参数。 |

真实输出只用于确认结构；仓库内保存的是虚构 ID、路径和标题的脱敏样例。解析器允许额外字段，但缺少必需字段或字段类型错误时必须降级，不能读取 OpenCode 私有数据库兜底。

## 6. 已有阶段 B 代码审核

已有导航改动可通过 TypeScript 和 Rust 静态检查，且已具备以下基础：

- 顶部出现 Claude Code / CodeX / OpenCode 三个入口；隐藏的终端和编排面板仍保持原挂载方式。
- 主 Tab 类型和后端保存白名单已接受三种 CLI；阶段 A 已把显示名和旧 Tab 归一化接到共享契约，并补正 CodeX/OpenCode 上次入口恢复。
- 旧 `project` 值可在前端归一化为 `claude`。

仍存在以下问题，所以阶段 B 不能提前标记完成：

1. `CliCodexPanel.vue` 和 `CliOpencodePanel.vue` 仍只有“即将支持”占位内容，没有 CLI 检测、版本状态、安装说明或工作区。
2. `openCodexTab` / `openOpencodeTab` 只设置布尔标记，没有真正执行各自的能力探测；Claude Code 门禁也尚未抽成按 `CliKind` 缓存的共享门禁。
3. 项目、会话、PTY、辅助终端和快照尚未携带或过滤 `cliKind`，三个入口仍没有数据隔离。
4. Claude Code 缺失页的次要按钮文案是“重新检测”，当前点击处理却会调用 npm 安装，文案和行为不一致。
5. 当前 `config_store.rs`、`project_manager.rs`、`persistent_state.rs` 和 `settings_manager.rs` 仍有直接 `fs::write` 路径；部分解析失败路径会回退空对象。阶段 C 之前必须避免以空对象覆盖损坏的用户配置。

## 7. 验证命令

```powershell
npx vue-tsc --noEmit
cd src-tauri
cargo test cli_
cargo check
```

按仓库规则，不在开发验证中启动 Vite、浏览器或 Tauri 应用。
