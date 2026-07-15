# 阶段 E：OpenCode 配置调研与实现约定

> 调研日期：2026-07-15
> 本机版本：OpenCode 1.17.20
> 完成状态：直接同步全局 `opencode.jsonc` 的实现、自动检查和用户人工验收均已通过。

## 已确认结论

1. OpenCode 的顶层 `provider` 是 provider ID 到配置对象的映射，一个文件可同时声明多个 provider，每个 provider 可声明多个模型。
2. 顶层 `model` 和 `small_model` 使用完整的 `provider_id/model_id`。TUI 最近选择另存在 `~/.local/state/opencode/model.json`，启动器只读该文件来解释启动时的模型来源，不修改它。
3. 本机真实全局配置是 `C:\Users\30919\.config\opencode\opencode.jsonc`。OpenCode 配置页与该文件使用同一份数据，不再维护启动器 profile、受管 JSONC、DPAPI 凭据或“应用方案”。
4. 配置文件中带非空 `npm` 的 provider 视为自定义 Provider，进入界面管理；未带 `npm` 的内置 Provider 覆盖项不展示也不修改。
5. 模型输入能力写在 `models.<model-id>.modalities.input`，界面支持独立选择 `text` 和 `image`，至少选择一项。

## 简化后的界面

配置页只展示：

- 顶层默认模型、Small model。
- 自定义 Provider 的配置名称、Provider ID、API 地址；高级区域可直接配置 JSONC `options.apiKey`。
- 每个 Provider 的模型 ID、显示名称，以及 Text / Image 输入能力。
- 获取模型、添加/删除模型、添加/删除 Provider、重新读取、保存和打开配置目录。
- 每个自定义 Provider 的 OpenCode 连接状态；连接 Key 单独读取和保存，启用/重新连接、禁用是另一组操作。

不再展示认证模式、内置/自定义类型切换、API 类型、环境变量名、Headers、Context/Output limit 或“应用此配置”。其中未展示的已有字段会原样保留。

## 读取和保存规则

- 打开配置页和启动 OpenCode 会话前都重新读取真实全局 JSONC；读取失败时显示错误，启动链路会阻止创建 PTY。
- 保存前比较文件 revision。如果文件在界面加载后被其它程序修改，拒绝覆盖并要求重新读取。
- 保存使用临时文件、备份、回读校验和原子替换。
- 只增删改界面管理的自定义 Provider、顶层 `model` / `small_model`，以及模型的 `name` / `modalities.input`。
- `shell`、`disabled_providers`、内置 Provider、Provider 未展示 options、模型 `limit`、`modalities.output` 和其它未知字段保持不变。
- JSONC 高级项中的 API Key 与 `options.apiKey` 直接同步，既可填写原值，也可填写 OpenCode 的 `{env:变量名}` 引用。
- OpenCode 可用状态同时取决于 `~/.local/share/opencode/auth.json` 凭据和 JSONC 的 `disabled_providers`。“保存 Key”只写当前自定义 Provider 的 `{ "type": "api", "key": "..." }`；启用/重新连接只从禁用列表移除该 ID；禁用只把 ID 加入禁用列表。启用和禁用都不改写或删除 Key。
- 已有 API Key 会读取到界面的掩码输入框，用户可以显示、修改并再次保存。OAuth、内置 Provider 和其它类型凭据不展示也不修改。
- `auth.json` 同样使用 revision、备份、校验和原子替换；外部连接状态变化后，旧界面不能覆盖。

## 启动规则

- 不设置 `OPENCODE_CONFIG`，不注入启动器 profile 环境变量，也不传 `--model`。
- 新建和恢复会话前，在目标项目目录执行 `opencode debug config --pure`，确认全局与项目配置可正常合并。
- 启动摘要只返回 provider ID、配置模型、Small model、推导出的当前模型和来源，不返回原始密钥。

## 自动检查

当前已通过：

```text
npx vue-tsc --noEmit
npm run build
cargo check
cargo test --lib
```

新增测试覆盖：自定义 Provider 识别、内置 Provider 隔离、未知顶层字段保留、Provider 未展示 options 保留、模型 limit / modalities.output 保留、Text/Image 对 `modalities.input` 的同步，以及 API Key 更新和启用/禁用不会修改 OAuth 凭据。

## 人工验收清单

1. 进入“配置 → OpenCode”，应直接显示 `llama-cpp`、API 地址和现有三个模型，不需要新建或应用方案。
2. 三个现有模型的 Text、Image 应均为选中状态。
3. 修改一个模型的 Image、保存并检查 JSONC，只有对应 `modalities.input` 改变，`limit` 和其它字段不丢失。
4. 修改配置名称、API 地址、API Key、默认模型或 Small model，保存后 JSONC 立即一致；重新读取后界面值不变。
5. 添加/删除自定义 Provider 和模型，保存后对应 JSONC 节点同步变化。
6. 如果 JSONC 中存在不带 `npm` 的内置 Provider 配置，界面不显示它，保存后该节点保持原样。
7. 用外部编辑器修改文件后点击“重新读取”，界面应更新；若界面已有修改且文件也被外部修改，保存应被 revision 保护阻止。
8. 新建和恢复 OpenCode 会话，均应先获取当前配置再创建终端；无效 JSONC 应阻止启动。
9. `auth.json` 没有凭据时，`llama-cpp` 应显示“未连接”；凭据存在但 ID 位于 `disabled_providers` 时应显示“已禁用”。已有 Key 应出现在掩码输入框中；点击“重新启用”后应从禁用列表移除且 Key 不变，重新启动 OpenCode 后可选择其模型。点击“禁用”后 Provider 配置和 Key 都应保留，仅把 ID 加入禁用列表。

## 核对来源

- OpenCode 官方 Config、Providers、Models 文档与 `https://opencode.ai/config.json` schema。
- 本机 `opencode --help`、`debug paths`、`debug config --pure` 和 `models <provider> --pure`。
- OpenCode 上游模型选择与 `model.json` 持久化实现。
