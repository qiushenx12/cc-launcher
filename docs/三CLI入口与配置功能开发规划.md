# Claude Code、CodeX、OpenCode 入口与配置功能开发规划

> 文档状态：开发中；阶段 A、B、C、D 已完成并经用户验证，阶段 E 已完成开发、等待用户验证。<br>
> 适用范围：Windows 版 Tauri + Vue 启动器；本期仅规划三套 CLI 的入口、配置、检测和启动边界。<br>
> 名称约定：界面文案使用 **Claude Code**、**CodeX**、**OpenCode**；内部稳定标识分别为 `claude`、`codex`、`opencode`，可执行命令分别为 `claude`、`codex`、`opencode`。本文不再使用"CC"作为界面文案。<br>
> 待办标记约定：`[x]` 表示用户已验证通过并确认完成；`[~]` 表示开发已完成但尚待用户验证，验证通过后再改为 `[x]`。

## 1. 目标

将当前仅面向 Claude Code 的启动器扩展为三 CLI 的统一入口，同时保持每个 CLI 的配置格式、认证方式和项目会话相互隔离。

完成后应达到：

1. 顶部原"项目"入口改名为 **Claude Code**；其右侧新增 **CodeX**、**OpenCode** 入口。三者进入同一类项目/终端工作区，但只能看到并启动本 CLI 的会话。
2. "配置"页增加 **Claude Code / CodeX / OpenCode** 二级切页。每页只展示该 CLI 可安全管理的字段，不用一个通用环境变量表单掩盖三者的差异。
3. 启动、安装提示、可执行文件检测、配置读写、模型提供商选择和错误提示均按 CLI 分派；一个 CLI 缺失不能阻断其余两个 CLI 的使用。
4. 既有 Claude Code 配置、项目和会话继续可用。已有没有 CLI 标记的持久化记录一律按 `claude` 迁移，不得丢失或混入 CodeX / OpenCode。
5. 对 OpenCode 使用已核实的 JSON/JSONC、分层合并、凭据与配置分离规则；不根据未公开的 `auth.json` 内部结构自行写入凭据。

本期不包含：改名应用产品、改动当前隐藏的终端/编排入口或其行为、替用户升级 CLI，或把任意项目的本地配置同步到全局配置。CodeX/OpenCode 的历史会话接入必须先完成本地 CLI 能力调研，不能预先承诺自动迁移。

## 2. 现状与设计边界

当前标题栏**只显示**"配置"和"项目"两个入口；`terminal` 与 `orchestration` 面板虽仍在 `App.vue` 中挂载，但没有标题栏入口，属于本次不改动范围。"项目"入口、依赖门禁、会话扫描、启动器、配置 Store 和 Rust 命令都直接使用 Claude Code。关键现有落点包括：

| 现有位置 | 当前职责 | 改造要求 |
| --- | --- | --- |
| `src/App.vue` | 两个可见标题栏入口、主 Tab、项目页 Claude Code 门禁、快捷键、上次主 Tab 恢复 | 只扩展可见入口为 Claude Code / CodeX / OpenCode；保持隐藏的 `terminal`、`orchestration` 面板和行为不变。 |
| `src/components/claude/ClaudePanel.vue` 与 `src/stores/claude.ts` | Claude Code 配置、启动和会话入口 | 作为 Claude Code 适配器保留，不将其 Store 直接复用于另两套 CLI。 |
| `src-tauri/src/claude_launcher.rs` | Claude Code 定位、版本检查、外部启动及 npm 安装 | 抽出共享的进程探测/启动能力；Claude Code 兼容层仍保留，CodeX/OpenCode 各有专属适配器。 |
| `src-tauri/src/config_store.rs`、`settings_manager.rs` | 当前 Claude 配置与设置持久化 | 新增带 `cli_kind` 的受管配置索引；三个 CLI 的真实配置文件读写各自实现。 |
| `src-tauri/src/session_manager.rs`、项目 Store/Panel | Claude 历史与项目会话 | 会话和 PTY 都带 `cli_kind`；不能把 Claude 历史文件格式套用到 CodeX/OpenCode。 |

**核心原则**：共用"选择项目、创建 PTY、显示终端、保存应用内元数据"的基础设施；不共用真实配置文件写入器、认证格式、历史会话解析器或模型字段。

## 3. 目标界面与交互

### 3.1 顶部功能入口

仅调整当前可见的标题栏入口，目标为：

```text
[☰] [配置] [Claude Code] [CodeX] [OpenCode]        [—] [□] [×]
```

- "项目"显示名称改为"Claude Code"，路由/持久化的旧值 `project` 在首次读取时兼容映射为 `claude`。
- Claude Code 保留现有项目页功能及 Claude Code 会话；CodeX、OpenCode 使用相同的项目工作区骨架，但数据过滤条件为各自的 `cli_kind`。
- 点击某个 CLI 入口时，只检查该 CLI 的可执行文件和版本。检测中显示该 CLI 名称；缺失时只覆盖当前工作区，提供安装说明、重新检测、返回配置三个动作。
- `Ctrl+T`、`Ctrl+W`、`Ctrl+Tab` 在工作区内作用于当前 CLI 的会话，不能跨 CLI 关闭或切换终端。
- 上次活动入口持久化为 `config | claude | codex | opencode | terminal | orchestration`；旧的 `project` 值读取为 `claude`，未知值回退到 `config`。
- 已隐藏的 `terminal`、`orchestration` 保持其既有的状态值、挂载方式和无标题栏入口状态；本需求不改变其顺序、快捷键或可见性。

### 3.2 配置页二级切页

配置页顶部或内容区固定提供：

```text
[ Claude Code ] [ CodeX ] [ OpenCode ]
```

- 仅切换配置内容，不切换顶部工作区入口。
- 每个切页均包含：CLI 检测结果、已保存配置方案列表、编辑区、启动/测试前检查、配置来源说明。
- 在切换切页、切换配置方案或离开编辑区前，未保存内容需显式提示；保存失败保留表单输入并显示具体文件/字段错误。
- 机密字段默认掩码显示，日志、Toast、诊断导出和配置预览必须脱敏。
- 初版不提供"把三种格式转换成同一个原始 JSON/TOML"能力。高级原始配置编辑仅允许在对应 CLI 格式中操作，且必须先校验再原子写入。

## 4. 统一数据模型与隔离方案

### 4.1 稳定标识和描述表

在前端和 Rust 后端定义同一组稳定标识：

```ts
type CliKind = 'claude' | 'codex' | 'opencode'

interface CliDescriptor {
  kind: CliKind
  label: 'Claude Code' | 'CodeX' | 'OpenCode'
  command: 'claude' | 'codex' | 'opencode'
  configFormat: 'json' | 'toml' | 'jsonc'
  supportsManagedProfile: boolean
}
```

描述表只负责 UI 文案、检测命令、启动参数入口和能力声明；真实配置解析/写入放在 `claude`、`codex`、`opencode` 三个适配器内。

### 4.2 应用内持久化

- 新增受管配置索引和项目会话的 `cli_kind` 字段；所有读取路径接受缺失字段并默认为 `claude`。
- 项目可共用同一个目录，但项目树、最近会话、右侧辅助终端、活跃 PTY、配置方案和会话快照均必须带 `cli_kind`，查询时严格过滤。
- 为避免影响已有 `%APPDATA%\ClaudeEnvManager\` 数据，本期沿用原应用数据根目录，只新增清晰的子文件/字段；是否在后续版本更名为产品中性的目录另立迁移任务。
- 配置方案的元数据可以保存在应用数据目录；密钥不得进入普通方案列表、窗口状态、项目快照或应用日志。新字段使用 Windows DPAPI 加密存储，读取失败时要求重新录入，不能把密钥降级写回明文应用配置。

### 4.3 共享与专属模块

| 能力 | 处理方式 |
| --- | --- |
| 可执行文件定位、`--version`、PTY 创建、退出处理、错误标准化 | 抽为共享 CLI 运行时服务。 |
| Claude Code 配置、CodeX 配置、OpenCode 配置 | 三个独立适配器及独立表单。 |
| 项目工作区 UI | 复用布局组件，通过 `cli_kind` 过滤数据并从描述表取得启动命令。 |
| CLI 原生历史会话恢复 | Claude Code 保持现状；CodeX 只读解析私有 JSONL 首条 `session_meta.cwd` 发现项目，再通过公开 App Server `thread/list` 读取 CLI/桌面版共享线程；OpenCode 按第 4.4 节的受检 JSON 命令接入。结构化接口失败时保留原生恢复选择器。 |
| 已隐藏的终端/编排 | 不在本次改动范围内；不调整其入口、行为或通信协议。 |

### 4.4 项目与会话接入：先调研、再实现

三个入口的内部布局以当前 `ProjectPanel` 为参考：左侧项目/会话树、中部 CLI 终端、右侧辅助区沿用现有交互语义。**"项目从哪里来、会话如何列出和恢复"不共用实现，必须按下表接入。**

| CLI | 已核实的本机能力 | 本期接入决策 |
| --- | --- | --- |
| Claude Code | 应用已有 `session_manager` 和项目 Store，当前项目页已可扫描并恢复其既有会话。 | 保持现有读取链路，只在数据模型中补齐 `cli_kind = claude` 的兼容迁移。 |
| CodeX（本机 `codex-cli 0.144.4`） | npm 安装入口的 `--version`、`-C`、`resume` 均通过；公开 App Server 协议提供 `thread/list`，可按精确 `cwd` 返回桌面版 `vscode` 与 CLI `cli` 来源的共享线程。私有 JSONL 首条 `session_meta` 包含项目 `cwd`；本机 44 个记录可归并为 8 个仍存在的项目目录。 | 项目发现只读递归扫描 `CODEX_HOME/sessions`，每个 JSONL 只解析首条 `session_meta` 的 `cwd/timestamp`，不读取消息正文、不修改历史文件；会话列表通过 `codex app-server` 的 `thread/list` 获取，并以 `codex -C <项目目录> resume <threadId>` 恢复。任一读取链路失败时保留手动选择目录、新会话和原生恢复选择器。 |
| OpenCode（本机 `opencode 1.17.20`） | `opencode debug scrap` 当前返回带 `worktree` 的已知项目 JSON；`opencode session list --format json --max-count <N>` 提供结构化会话列表；启动命令接受项目目录，并支持 `--session <id>` 继续会话。 | 先为目标 CLI 版本增加能力探测和 JSON schema 校验；通过 `debug scrap` 读取项目目录、在当前项目工作目录执行 `session list --format json` 读取会话、通过 `--session` 恢复。命令缺失、JSON 不合法或版本不兼容时，降级为"选择目录 + 新建 OpenCode 会话"，不使用数据库或私有文件作为替代。 |

实施顺序：先把 `ProjectPanel` 的布局和应用内 PTY 状态提炼为可传入 `cli_kind` 的工作区外壳；随后依次接入 Claude Code 现有链路、CodeX JSONL 项目发现 + App Server 线程列表与原生 resume 降级入口、OpenCode 的受检 JSON 列表。任何一个适配器未通过版本/输出校验时，只禁用该适配器的项目发现或历史会话入口，不能影响新会话或其它 CLI。

## 5. 三套 CLI 的配置规划

### 5.1 Claude Code

**目标**：保留现有 Claude Code 使用习惯、项目页结构和配置方案，同时将原"项目"入口显示名称改为 Claude Code。

| 项目 | 规划 |
| --- | --- |
| 真实配置位置 | 阶段 C 审计确认：启动器命名方案保存在 `%APPDATA%\ClaudeEnvManager\env_configs.json`，启动时注入进程环境或由用户明确应用到注册表；`~/.claude/settings.json` 只承载权限与 away summary 等 Claude 设置。canonical 文件缺失时兼容读取 `~/.claude/claude.json` / `~/.claude/config.json`，保存只写 canonical `settings.json`，不改历史源文件。 |
| 格式与核心字段 | JSON；`ANTHROPIC_BASE_URL`、认证 Token/API Key、主模型及 Sonnet/Opus/Haiku 等角色模型字段。 |
| 写入策略 | 读取后仅更新应用负责的 `env` 与明确约定的联动字段，保留未知顶层字段；临时文件校验成功后原子替换。失败时不留下半写文件。 |
| 配置方案 | 延续现有 Claude Code 环境变量方案和排序；旧记录默认属于 `claude`。 |
| 启动 | 沿用现有 `claude_launcher` 语义，最终通过共享运行时启动 `claude`，并仅注入当前 Claude Code 方案所需环境变量。 |
| 验证 | `claude --version`、配置 JSON 解析、启动前环境变量脱敏预览；不输出 Token。 |

需要先审计当前 Claude Code 配置写入路径与上述文档约定是否一致；若存在历史文件名或字段差异，以兼容读取、单一受控写入路径和迁移提示处理，不能静默覆盖用户文件。

### 5.2 CodeX（Codex CLI）

**目标**：针对 Codex CLI 的 TOML 配置和独立认证文件提供专属方案，避免污染 Claude Code 环境变量。

| 项目 | 规划 |
| --- | --- |
| 真实配置位置 | 阶段 D 按本机 `codex-cli 0.144.4` 与当前官方手册复核后，保留 `~/.codex/config.toml` 为用户/桌面版全局配置；每个启动器方案写入 `$CODEX_HOME/cc-launcher-<id>.config.toml`，通过 `--profile` 叠加。`~/.codex/auth.json` 或系统凭据存储只读复用，启动器不改写。 |
| 格式与核心字段 | 独立 TOML profile 管理 `model_provider`、`model`、`model_reasoning_effort`、`openai_base_url`、`[model_providers.<id>]`、`base_url`、`env_key` 和当前版本支持的 `wire_api = "responses"`；未知 TOML 表保留。 |
| 官方与自定义模式 | UI 明确区分“保留 Codex 官方登录”和“自定义提供商 API Key”。官方模式复用 CLI/桌面版共享登录；自定义模式使用 provider `env_key`，Key 由 Windows DPAPI 加密后保存在启动器数据目录，启动时临时注入。 |
| 写入策略 | TOML、启动器方案索引和 DPAPI 凭据均先写临时文件并校验，再提交；保存不自动改变活动方案。点击“应用此配置”后单独持久化并回读活动方案。可显式勾选同步到全局 `config.toml`；此时全局 TOML、活动索引、当前用户环境变量和所有权记录作为一个事务提交并回读，失败统一恢复。`auth.json` 始终只读。 |
| 启动 | 左侧选择只切换编辑对象；保存后点击“应用此配置”并回读成功，才更新当前活动方案。运行 `codex --profile <当前活动方案> -C <项目>`；配置不固化在历史会话中，关闭终端后应用新方案再恢复会话会使用新的当前方案。 |
| 模型获取 | 第三方模式根据 Base URL 和表单输入、DPAPI 已保存或现有环境变量中的 API Key 请求 OpenAI 兼容 `/models` 端点；模型列表只用于输入/下拉选择，不自动保存或应用。 |
| 验证 | `codex --version`、TOML 解析、当前认证模式检查、第三方模型获取、全局 CLI/桌面端切换和一次不含密钥的启动前诊断。 |

现有 `docs/模型提供商的配置方式.md` 已记录 Codex 的基础格式。实现前需按当时安装的 Codex CLI 版本重新验证字段和认证结构，不能将 OAuth Token 当作普通 API Key 覆盖。

### 5.3 OpenCode

**已核实的配置事实**：本机 OpenCode 在 2026-07-15 为 1.17.20；`opencode debug paths` 显示全局配置目录为 `~/.config/opencode`、状态目录为 `~/.local/state/opencode`、数据目录为 `~/.local/share/opencode`，本机已有 `~/.config/opencode/opencode.jsonc`。官方文档与本机能力探测确认 OpenCode 同时支持 JSON 与 JSONC；远程、全局、`OPENCODE_CONFIG` 指定文件、项目根 `opencode.json(c)`、`.opencode` 目录、`OPENCODE_CONFIG_CONTENT` 和管理员配置会按顺序合并，后加载项覆盖前者。提供商凭据由登录/连接流程保存到数据目录的 `auth.json`，而提供商结构由配置文件的复数语义 `provider` 映射定义；一个配置可同时包含多个 provider，每个 provider 又可包含多个模型。

| 项目 | 规划 |
| --- | --- |
| 配置位置 | 直接读取和修改 `~/.config/opencode/opencode.jsonc`，不再创建启动器 profile，也不设置 `OPENCODE_CONFIG`。项目配置仍可覆盖全局配置，启动前在项目目录读取最终有效配置。 |
| 格式与边界 | JSON/JSONC；只展示和修改带 `npm` 的自定义 Provider、顶层默认模型及 Small model。内置 Provider 和所有未展示字段保持原样。 |
| Provider Key | `/connect` / `opencode auth login` 的 API Key 位于 `~/.local/share/opencode/auth.json`。界面只允许读取和保存当前自定义 Provider 的 `type: api` 条目；OAuth、内置 Provider和未知凭据不修改。 |
| 自定义提供商 | 一个文件可增删多个 provider。每个 provider 配置 ID、显示名、`npm`、`options.baseURL` 和多个模型；模型输入能力同步到 `modalities.input` 的 `text` / `image`。 |
| Key 与状态 | “保存 Key”只更新 `auth.json`；启用/重新连接只从 `disabled_providers` 移除 ID；禁用只加入 ID。启用和禁用均不清空 Key。`options.apiKey` 保留为高级替代配置。 |
| 模型选择 | 显式默认模型使用完整 `provider_id/model_id` 保存到顶层 `model`，可选轻量模型保存到顶层 `small_model`。TUI `/models` 的交互选择只把 recent/favorite/variant 写入 `~/.local/state/opencode/model.json`；该文件不是配置方案，启动器不修改它。OpenCode 1.17.20 启动回退顺序为命令行 `--model`、合并后的 `model`、recent、首个 provider 默认模型；agent 自身的 `model` 还可覆盖普通默认值。本期写入顶层 `model`，保留项目和 agent 的原生覆盖语义。 |
| 验证 | `opencode --version`、JSONC 解析、携带脱敏环境变量执行 `opencode debug config` 预览合并结果；必要时用 `opencode providers list` 和 `opencode models <provider>` 进行只读检查。 |

OpenCode 配置页直接以全局 `~/.config/opencode/opencode.jsonc` 为唯一数据源；保存前检查 revision，并通过备份、校验和原子替换写回。界面只管理带 `npm` 的自定义 Provider，内置 Provider 和未展示字段保持不变。

## 6. 开发待办（按依赖顺序）

### 阶段 A：基线与契约

- [x] 建立 `CliKind`、CLI 描述表、错误码和前后端序列化契约；固定 UI 显示名为 Claude Code / CodeX / OpenCode，内部只用小写稳定标识。（静态契约与自动测试已验证）
- [x] 盘点现有 `%APPDATA%\ClaudeEnvManager\` 文件、`project` 主 Tab 值、项目会话和 Claude Code 配置方案的实际结构；记录迁移样本与回滚方案。（脱敏盘点与迁移夹具已验证）
- [x] 为每个 CLI 写出"可执行文件缺失、版本命令失败、版本过低、配置不可解析、认证缺失、提供商不可达"的统一状态模型和中文提示。（前后端序列化测试已验证）
- [x] 在变更前补充最小迁移测试样本：无 `cli_kind` 的旧项目/会话/配置、旧 `lastActiveMainTab = project`、未知配置字段、写入中断。（迁移与幂等测试已验证）
- [x] 对目标版本重跑第 4.4 节的能力探测：CodeX 的 `-C` / `resume` / App Server `thread/list`，以及 OpenCode 的 `debug scrap`、`session list --format json`、`--session`。把命令可用性、输出样例和 JSON schema 固化为适配器测试夹具。（OpenCode 1.17.20 已通过；CodeX 0.144.4 已验证当前桌面线程可按 `cwd` 结构化返回，早期 WindowsApps 权限失败仍保留为受控失败夹具）

**完成标准**：不存在把 CLI 名称、可执行文件路径或配置格式散落硬编码在 Vue 模板中的新增设计；历史数据迁移规则可复现且可回退。

阶段 A 的脱敏盘点、回滚规则、能力探针和已有阶段 B 代码审核见 [`阶段A-基线契约与迁移审计.md`](./阶段A-基线契约与迁移审计.md)。

### 阶段 B：顶部导航与工作区隔离

- [x] 将 `MainTab` 中的 `project` 迁移为 `claude`，新增 `codex | opencode`；旧值 `project` 读取为 `claude`。既有 `terminal | orchestration` 状态值、面板挂载和隐藏状态保持不变。（用户已验证开发模式与入口切换）
- [x] 将顶部"项目"改为 Claude Code，并在其右侧加入 CodeX、OpenCode；只修改当前可见标题栏入口，更新对应状态栏、左侧栏标题、空状态、快捷键上下文和无障碍标签。（用户已验证入口切换）
- [x] 把当前项目页中的 Claude 专属门禁拆成按 `CliKind` 缓存的门禁状态；任一 CLI 的重试仅重新检测本 CLI。（用户已验证门禁缓存与独立重试）
- [x] 将项目/会话/辅助终端/PTY 查询与创建入口全部传入 `cli_kind`；迁移旧数据为 Claude Code，验证三个页不会互相显示会话。（早期类型丢失记录已自动拆分、恢复和去重；用户已验证三入口项目与会话不再串台）
- [x] CodeX 工作区复用当前项目页布局：只读解析 `CODEX_HOME/sessions` 中每个 JSONL 的首条 `session_meta.cwd` 自动发现项目，使用 App Server `thread/list` 按 `cwd` 同步桌面版/CLI 共享线程，使用 `codex -C <项目目录>` 创建会话，并以 `resume <threadId>` 精确恢复；原生选择器作为降级入口。（本机 44 个 JSONL 归并出 8 个有效项目；用户已验证项目发现与真实会话同步）
- [x] OpenCode 工作区复用当前项目页布局：先通过受检的 `opencode debug scrap` 发现项目，再在项目工作目录使用 `opencode session list --format json` 列出会话，使用 `opencode --session <id>` 恢复；能力不满足时降级为选择目录和新建会话。（`worktree = "/"` 的全局项目会展开为去重后的真实会话目录；用户已验证项目、历史会话与恢复）

**完成标准**：Claude Code 的既有项目会话可继续使用；在同一路径下创建的 CodeX/OpenCode 会话只在各自入口出现，`Ctrl+T/W/Tab` 不跨域操作；隐藏的终端/编排功能无改动。

阶段 B 的实现范围、兼容规则和人工验收步骤见 [`阶段B-工作区隔离验证说明.md`](./阶段B-工作区隔离验证说明.md)。

### 阶段 C：配置页框架与 Claude Code 兼容层

- [x] 在配置页加入 Claude Code / CodeX / OpenCode 二级切页和共享的未保存变更保护、错误提示、掩码字段、脱敏诊断框架。（启动前检测改为配置编辑下方的按需故障取证弹窗；用户已验证）
- [x] 将现有 `ClaudePanel` 包装为 Claude Code 配置子页；先不重构已验证的 Claude Code 表单行为。（原字段、列表、启动选项和会话区均保留；用户已回归通过）
- [x] 审计 Claude Code 真实文件读写与当前文档约定，补足未知字段保留、原子写入和失败回滚；为历史文件路径保留兼容读取。（保存后回读方案、排序和活动状态，一致后才提示成功；用户已验证）
- [x] 将配置方案列表和当前启动选择改为 `(cli_kind, profile_id)`，禁止同一 ID 跨 CLI 误用。（每个 CLI 独立保存稳定 profile ID；项目终端重启时按当前活动方案启动，不把旧方案固化到历史会话；用户已验证）

**完成标准**：配置页可稳定切换三页；Claude Code 功能、保存方案和内置终端启动回归通过，且尚未引入 CodeX/OpenCode 的伪共享字段。

阶段 C 的实现边界、文件审计、自动检查和人工验收步骤见 [`阶段C-配置框架与Claude兼容层验证说明.md`](./阶段C-配置框架与Claude兼容层验证说明.md)。

### 阶段 D：CodeX 专属配置与运行时

- [x] 新增 Codex CLI 定位、版本检测、启动和错误翻译适配器；定位顺序、PATH 处理和 Windows 扩展名规则与 Claude Code 共用基础设施。（共享运行时已接入本机 `0.144.4`，用户已验证门禁与启动）
- [x] 新增 Codex 配置表单与 TOML/JSON 后端读写器，覆盖官方/自定义模式、模型、推理强度、端点和 wire API；编辑布局与 Claude Code 的单列字段、模型输入/下拉和操作区对齐。（当前版本 `wire_api` 仅生成官方支持的 `responses`，用户已验证）
- [x] 实现独立 profile TOML、启动器索引与 DPAPI 凭据的预校验、临时文件、提交和失败回滚；增加第三方 `/models` 获取，以及显式全局 TOML/当前用户环境变量同步事务；官方 `auth.json` 只读保留。（自动测试已覆盖未知 TOML、无明文 Key、模型地址、全局 provider 切换和 DPAPI 往返；用户已完成真实保存验证）
- [x] 在 CodeX 工作区将当前活动方案以 `--profile` 注入启动上下文，并验证配置错误不会破坏已有 Claude Code 或 OpenCode 文件。（左侧选择只编辑，点击“应用此配置”并回读成功后才切换；新会话、精确恢复和原生恢复入口共用当前方案；用户已验证）

**完成标准**：官方认证保留、自定义提供商保存、损坏 TOML/写入失败回滚和 CodeX 新建终端会话均可验证。

阶段 D 的实现边界、当前 CLI 规则和人工验收步骤见 [`阶段D-CodeX专属配置与运行时验证说明.md`](./阶段D-CodeX专属配置与运行时验证说明.md)。

### 阶段 E：OpenCode 专属配置与运行时

- [x] 新增 OpenCode CLI 定位和版本检测适配器；启动命令使用 `opencode`，按第 4.4 节接入其公开会话命令，不复用 Claude Code/Codex 的历史会话格式或参数。（阶段 B 已实现并经用户验证；1.17.20 配置能力已于 2026-07-15 复核）
- [x] 直接读取和原子写回全局 `opencode.jsonc`；通过 revision 阻止覆盖外部并发修改，并保留内置 Provider、未知顶层字段、Provider 未展示 options 和模型未展示字段。（自动测试与用户真实文件验收通过）
- [x] 简化 OpenCode 表单：只显示顶层 `model` / `small_model`，以及自定义 Provider 的名称、ID、API 地址、API Key 和模型；不再提供启动器方案、应用按钮、认证模式、Provider 类型、API 类型、Headers 等复杂字段。（用户交互验收通过）
- [x] 模型支持配置 Text / Image 输入能力，直接同步 `modalities.input`；现有 `limit`、`modalities.output` 等字段保持不变。（自动测试与界面布局验收通过）
- [x] OpenCode 新建或恢复终端前重新读取全局 JSONC，并在项目目录运行 `opencode debug config --pure` 获取当前合并配置；不设置 `OPENCODE_CONFIG`、不修改 `model.json`、不强制传 `--model`，读取失败阻止启动。（静态检查、模型回退测试与用户验收通过）
- [x] 接入自定义 Provider `/models`、`opencode debug config`、`auth.json` API Key 凭据和 `disabled_providers` 启用状态；Key 单独保存，启用/重新连接和禁用只切换禁用列表且永不清空 Key。只允许修改当前自定义 Provider，OAuth 和内置 Provider 保持不变。（自动隔离测试与真实连接验收通过）

**完成标准**：界面与全局 `opencode.jsonc` 完全同步；只管理自定义 Provider；Key 保存与 Provider 启用/禁用相互独立且不改内置/OAuth Provider；Text/Image 正确写入 `modalities.input`，启动预览中 API Key 始终脱敏。

阶段 E 的配置调研、模型选择语义、实现边界和人工验收步骤见 [`阶段E-OpenCode配置调研与实现约定.md`](./阶段E-OpenCode配置调研与实现约定.md)。

### 阶段 F：回归、迁移与交付

- [x] 前端执行 `npx vue-tsc --noEmit`，后端执行 `cargo check`；不要为本项在开发流程中自动启动 Tauri 应用。（最终检查通过）
- [x] 对三 CLI 分别验证：已安装、未安装、版本命令失败、配置为空、配置无效、保存、取消、重新打开、启动新会话、关闭会话、重新进入应用。（分阶段用户验收与自动失败夹具覆盖完成）
- [x] 验证旧 Claude Code 用户数据迁移、上次 Tab 为 `project` 的兼容、三个 CLI 使用同一项目路径、密钥脱敏、文件写入失败回滚、用户项目 OpenCode 配置覆盖提示，以及 CodeX 恢复选择器和 OpenCode JSON 列表的降级行为。（迁移、隔离、回滚和脱敏自动测试通过，三 CLI 实际功能由用户验收通过）
- [x] 生成打包后的 Windows 产物，记录各 CLI 版本、测试结果和遗留限制。（NSIS 生产构建成功；依照开发约定未自动启动产物）

**完成标准**：三套入口、三页配置和三条启动链路可独立工作；旧 Claude Code 数据无丢失；任何失败不覆盖其它 CLI 的配置或凭据。

阶段 F 的版本、检查结果、生产产物和限制见 [`阶段F-最终回归与交付记录.md`](./阶段F-最终回归与交付记录.md)。

## 7. 验收矩阵

| 场景 | 预期结果 |
| --- | --- |
| 旧版本升级，最后主 Tab 为"项目" | 自动进入 Claude Code，原项目与会话仍可见。 |
| Claude Code 可用、CodeX 缺失、OpenCode 可用 | Claude Code 和 OpenCode 正常；点击 CodeX 只显示其安装/重试提示。 |
| 三个 CLI 共用同一项目目录 | 三个入口各自只显示本 CLI 的会话和 PTY。 |
| Claude Code 配置保存失败 | Claude Code 文件保留原样，CodeX/OpenCode 文件完全不受影响。 |
| CodeX 保留官方认证后切换自定义提供商 | 仅配置文件按确认策略改变，官方 OAuth 不被静默清除。 |
| OpenCode 已有全局 JSONC 和项目 `opencode.json` | 配置页直接同步全局文件；每次新建/恢复前重新读取全局文件，并在项目目录解析项目覆盖后的有效配置。 |
| OpenCode 自定义 Key | API Key 原值或 `{env:...}` 引用直接同步到全局 JSONC；启动预览、日志和项目文件不回显密钥。 |
| CodeX 项目会话 | 只读扫描私有 JSONL 的首条 `session_meta.cwd` 建立项目；以 `-C <项目目录>` 创建，通过 App Server `thread/list` 按目录同步桌面版/CLI 线程，点击时以线程 ID 精确恢复；原生选择器作为降级入口。 |
| OpenCode 项目与会话命令不兼容 | 禁用项目发现/历史列表，仍可选择目录并创建新会话；不读取 OpenCode 数据库或私有文件兜底。 |
| CLI 未安装或 `--version` 失败 | 当前入口被门禁覆盖；其它入口、配置草稿和已有数据不受影响。 |

## 8. 风险与明确决策

1. **不能以 Claude Code 为模板直接复制。** Claude Code 主要是环境变量 JSON；CodeX 是 TOML + 认证 JSON；OpenCode 是 JSON/JSONC 分层合并 + 独立凭据文件。统一 UI 外壳不等于统一文件协议。
2. **OpenCode 的 `auth.json` 只做窄范围 Key 管理。** 应用只读取并增改 JSONC 中自定义 Provider 对应的 `type: api` 条目；禁用 Provider 不删除该条目。OAuth、内置 Provider 和未知凭据不修改。JSONC 的 `options.apiKey` 仍作为高级替代方式同步。
3. **OpenCode 分层配置是叠加而不是替换。** 项目 `opencode.json(c)` 仍可覆盖全局文件；启动前检测展示的是项目目录下的最终有效配置。
4. **项目与会话来源必须受限。** Claude Code 保持现有读取逻辑；CodeX 项目发现仅允许读取私有 JSONL 首条 `session_meta.cwd/timestamp`，不得读取正文或写入历史，会话内容仍只依赖公开 App Server `thread/list` 和原生 `resume`；OpenCode 只依赖经过版本和 JSON 校验的 CLI 输出，不读取其数据库或私有文件兜底。
5. **配置写入必须可回滚。** 特别是 CodeX 双文件更新和用户全局 OpenCode JSONC，同步/修改前应备份、预校验、原子替换，并保留用户未知字段与注释。

## 9. 参考资料与本机核对

- OpenCode 官方：[Config](https://opencode.ai/docs/config/) — JSON/JSONC 支持、配置合并与优先级、`OPENCODE_CONFIG`、全局/项目配置位置。
- OpenCode 官方：[Providers](https://opencode.ai/docs/providers/) — 凭据登录流程、`provider` 配置、自定义 OpenAI 兼容端点和 `@ai-sdk/openai` / `@ai-sdk/openai-compatible` 选择。
- OpenCode 官方：[Models](https://opencode.ai/docs/models/) — `provider_id/model_id`、`model`、`small_model` 和模型级选项。
- 本机只读核对：2026-07-14 的 `opencode --version`、`opencode --help`、`opencode debug scrap`、`opencode session list --format json --max-count 3`；CodeX 早期 WindowsApps 资源执行权限失败详见阶段 A 审计，随后 npm `codex-cli 0.144.4` 已完成 `--version`、帮助命令和 App Server `thread/list` 的补充验证，并核对 `~/.codex/sessions` 的 44 个 JSONL 首条元数据可归并出 8 个有效项目目录。
