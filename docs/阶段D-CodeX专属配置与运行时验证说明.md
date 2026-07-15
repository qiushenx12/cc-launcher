# 阶段 D：CodeX 专属配置与运行时验证说明

> 开发状态：静态实现、自动检查与用户人工验收均已完成。
> 核对版本：Windows 本机 `codex-cli 0.144.4`；配置与认证边界已按当前 Codex 官方手册重新核对。

## 当前实现规则

- 配置页的 CodeX 子页按 Claude Code 编辑器的单列字段、地址操作、模型输入/下拉和应用范围布局对齐，支持官方登录、自定义提供商、模型、推理强度、Base URL、provider ID、`env_key` 和 `wire_api = "responses"`。
- 默认只生成 `$CODEX_HOME/cc-launcher-<profile-id>.config.toml`，启动项目终端时传入 `--profile cc-launcher-<profile-id>`，不会修改 `~/.codex/config.toml`。只有应用时主动勾选“同时同步到全局配置”才写入全局文件。
- CLI、桌面版和 IDE 共用的 `auth.json` 或系统凭据存储只做状态检查。官方模式不会解析、覆盖、清空或迁移 OAuth Token。
- 自定义 API Key 不写 TOML、`auth.json`、方案 JSON、项目数据或诊断内容。Key 使用当前 Windows 用户的 DPAPI 加密，密文位于 `%APPDATA%\ClaudeEnvManager\codex\credentials\`，启动子进程时按方案的 `env_key` 注入。同步到全局时，为使启动器外的 CLI 和桌面端可读取，Key 会明确写入当前 Windows 用户环境变量；该存储不是密文，界面会在操作前提示。
- 第三方模式可根据 Base URL 和当前输入、DPAPI 已保存或现有环境变量中的 API Key 请求 OpenAI 兼容的 `/models` 端点。获取结果只更新模型下拉，不会自动保存或应用配置。
- 配置属于“当前启动选择”。创建或恢复历史会话时使用当时活动的 CodeX 方案；终端关闭后切换方案再恢复同一历史会话，会使用新的当前方案。
- 配置优先级为“CLI 参数 → 受信任项目的 `.codex/config.toml` → 启动器 `--profile` → 全局 `config.toml`”。项目配置可能覆盖 profile 中的模型；故障诊断会明确展示这条优先级。
- 左侧方案列表只切换当前编辑对象，不立即改变运行配置。保存方案后点击“应用此配置”，活动方案写入并回读一致后才提示应用成功；当前活动项显示“应用中”。勾选全局同步时，按钮改为“应用并同步全局”，成功项额外显示“全局”。
- “启动前检测”是故障取证入口，用于在模型、端点或登录行为异常后收集 CLI 版本、来源、profile 名和脱敏配置，不作为启动门禁之外的额外确认步骤。

## 写入与回滚

保存会依次验证并提交：独立 profile TOML、DPAPI 凭据和启动器方案索引，但不会自动改变当前活动方案。提交后重新读取并比较；全部一致才向前端返回成功。

应用操作由后端统一事务处理。仅启动器应用时写入并回读 `app_state.json` 的活动索引；勾选全局同步时，还会原子更新并回读全局 `config.toml`、启动器的全局 provider 所有权记录和当前用户环境变量。任一步失败都会恢复旧活动方案、旧全局 TOML、旧环境变量及旧所有权记录，并报告回滚是否完整。切换回官方全局方案时，只恢复启动器自己管理且未被外部修改的环境变量。

独立 TOML 只更新表单负责的键；文件中其它合法表和字段会保留。自定义 provider 不生成 `requires_openai_auth`，避免与 `env_key` 冲突。`openai`、`ollama`、`lmstudio` 是保留 provider ID，不能作为自定义 ID。

## 自动检查覆盖

- 官方 profile 写入时保留未知 TOML 表。
- 自定义 provider 只保存 `env_key`，生成文件不含 API Key 明文。
- Windows DPAPI 加密结果不含明文，且能由当前用户正确解密。
- OpenAI 兼容模型地址能正确处理根地址、`/v1` 和带前缀的 `/api/v1`，模型结果去重排序。
- 全局同步保留未知 TOML 字段，只清理上一个由启动器管理的 provider 表；官方全局方案会恢复 `model_provider = "openai"`。
- 既有阶段 A/B/C 的迁移、会话隔离、文件事务和 Claude Code 测试继续通过。

## 人工验收清单

1. 进入“配置 → CodeX”，新建“官方登录”方案，模型和推理强度可留空继承全局，也可填写后保存。保存成功后检查 `~/.codex/cc-launcher-*.config.toml`；原 `~/.codex/config.toml` 内容不应改变。
2. 保存官方方案前后分别运行 `codex login status`；已有 ChatGPT 登录应保持不变，`auth.json` 的修改时间不应因保存方案而变化。
3. 新建“自定义提供商”方案，填写非保留 provider ID、Responses Base URL 和 API Key，点击“获取模型”；列表应来自该第三方 `/models` 接口，选择模型后表单变为未保存状态。
4. 保存自定义方案后确认 TOML 只有 `env_key`，`profiles.json` 不含 Key；凭据目录中只有不可读的 `.bin` 密文。
5. 在左侧选中一个非活动方案，确认只切换编辑内容；点击“应用此配置”后，该项应显示“应用中”，按钮置灰并显示“应用中”。
6. 勾选“同时同步到全局配置”后应用第三方方案，确认全局 `config.toml` 保留原有未知字段、切换到对应 provider，当前用户环境变量中存在方案的 `env_key`。重启外部终端和 CodeX 桌面端后验证模型及第三方消耗。
7. 再把官方方案勾选全局同步并应用，确认全局 `model_provider = "openai"`、官方登录仍可用、上一个由启动器创建且未被外部修改的第三方环境变量已恢复或删除，`auth.json` 未改变。
8. 在 CodeX 工作区新建会话，终端应以当前应用方案启动。关闭该终端，在左侧选择另一个方案并点击“应用此配置”，再恢复同一会话；应使用新的当前方案。
9. 分别验证 CodeX 精确历史恢复和“CodeX 原生恢复”入口；两者都应携带当前 `--profile`，并继续使用原项目目录。
10. 修改 CodeX 表单但不保存，再切换配置子页、方案、顶部工作区或关闭应用，应出现未保存提示；取消后保留输入。
11. 点击 CodeX 编辑区底部的“启动前检测”，诊断应分别显示实际应用方案和上次成功同步的全局方案，但绝不能显示 Key 原文、用户环境变量值或 OAuth Token。
12. 删除一个测试方案，独立 profile TOML 和对应 DPAPI 凭据应删除；`auth.json`、Claude Code 和 OpenCode 数据不应变化。若删除的是活动方案，当前状态应变为未应用任何启动器方案；若它曾同步全局，删除前应先同步另一个全局方案，删除本身不会撤销全局 TOML。

不要为了人工测试故意破坏真实 `config.toml` 或 `auth.json`；损坏 TOML、提交失败和回滚路径由自动测试与静态检查覆盖。
