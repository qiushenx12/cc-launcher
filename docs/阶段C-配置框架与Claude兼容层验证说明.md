# 阶段 C：配置框架与 Claude Code 兼容层验证说明

> 开发状态：静态实现与自动检查已完成，等待用户人工验证。
> 安全边界：阶段 C 不写入 CodeX/OpenCode 配置或凭据，也不启动开发服务器或 Tauri 应用。

## 已实现范围

- 配置页新增 Claude Code / CodeX / OpenCode 二级切页。启动前检测、配置来源和脱敏诊断不再常驻占用页面空间，改由配置编辑底部的“启动前检测”按钮按需打开；CodeX/OpenCode 在阶段 D/E 前只展示各自边界，不提供伪共享字段，也不会写入真实文件。
- 原 `ClaudePanel` 原样作为 Claude Code 子页使用，保留方案列表、会话记录、配置字段、环境变量应用和启动选项。
- Claude Code 草稿会跟踪未保存状态。切换配置子页、切换或新建方案、进入 CLI 工作区、进入内置终端、关闭应用前都会明确询问；取消后保留当前表单和页面。
- 认证字段改用共享掩码组件。启动前诊断对 token、API key、secret、password、credential、authorization 和 cookie 类字段递归脱敏；“应用到环境变量”确认预览也不再显示令牌原文。
- 保存失败不再先修改前端方案列表或错误显示“已保存”。表单内容会保留，后端错误会通过共享状态提示显示。
- 每个命名方案获得独立、稳定的 `profile_id`；活动选择保存为 CLI 专属状态中的 `(cli_kind, profile_id)`。方案重命名沿用原 ID，同名方案在不同 CLI 下不会共用选择。项目历史会话不固化旧方案，终端每次启动时读取该 CLI 的当前活动配置。

## Claude Code 文件审计与兼容规则

阶段 C 对当前代码和本机文件名做了只读审计，确认现有行为与原规划中的“全部写入 `settings.json.env`”描述不一致，因此按不破坏既有用户习惯的原则修正文档并加固现状：

| 数据 | 当前受控位置 | 阶段 C 行为 |
| --- | --- | --- |
| 启动器命名方案 | `%APPDATA%\ClaudeEnvManager\env_configs.json` | 继续保存环境变量方案；保留已有方案中的未知变量；启动时注入子进程，只有用户点击“应用到环境变量”才写注册表。 |
| Claude 权限/away summary | `~/.claude/settings.json` | 只更新 `skipDangerousModePermissionPrompt`、`permissions.defaultMode` 和 `awaySummaryEnabled`，保留所有未知顶层及嵌套字段。 |
| 历史 Claude 设置路径 | `~/.claude/claude.json`、`~/.claude/config.json` | 仅在 canonical `settings.json` 不存在时兼容读取；下一次保存写入 canonical 文件，历史源文件不修改、不删除。 |
| 配置顺序与活动方案 | `%APPDATA%\ClaudeEnvManager\app_state.json` | Claude/CodeX/OpenCode 使用独立状态块；稳定 profile ID、顺序和活动 ID 在同一次 app-state 提交中保存。 |

以上三个 JSON 写入链路均采用：序列化与解析预校验 → 同目录临时文件 → 刷新并再次校验 → 原文件改名为 `.bak` → 提交临时文件。提交失败时恢复备份；源文件无法解析时直接报错，不能按空对象覆盖。

## 自动检查结果

```text
npx vue-tsc --noEmit
npm run build
cargo test
```

Rust 当前共 42 项测试通过，新增覆盖：无效 JSON 不替换原文件、成功提交保留备份、正式文件缺失时从已验证备份恢复、未知方案字段保留、损坏 settings 不覆盖、历史路径迁移保留未知字段、同名 profile ID 按 CLI 隔离、app-state 未知字段往返保留。

## 人工验收清单

1. 进入“配置”，依次切换 Claude Code、CodeX、OpenCode；页面不应再常驻显示大块检测内容，CodeX/OpenCode 只显示各自后续阶段说明。Claude Code 的配置编辑底部应出现“启动前检测”按钮，点击后才显示当前 CLI 的检测状态、配置来源和脱敏诊断。
2. 在 Claude Code 中修改任一字段但不保存，再分别尝试切换配置子页、切换另一方案、点击顶部 CLI 工作区、关闭应用；每次都应提示未保存修改。点“取消”应保留原页面与输入，点“继续”才放弃草稿。
3. 确认认证令牌默认掩码。打开“启动前检测”弹窗，以及点击“应用到环境变量”查看确认内容，均不应出现令牌原文。
4. 新建、保存、重命名、删除一个 Claude Code 测试方案并重新打开应用；列表顺序、活动方案和字段应正确恢复。使用方案 A 启动项目会话后，关闭终端并切换到方案 B，再恢复该会话时应使用当前方案 B。
5. 回归现有 Claude Code 功能：获取模型、保存权限/away summary、选择启动目录、外部启动，以及“使用内置终端”启动。保存失败时不得清空表单或显示成功。
6. 检查 `%APPDATA%\ClaudeEnvManager\env_configs.json.bak`、`app_state.json.bak` 和发生 settings 保存后的 `~/.claude/settings.json.bak`；正常保存后备份应保留上一版。不要为了人工测试故意损坏真实配置，损坏 JSON 路径已由自动测试覆盖。

全部通过后，可将阶段 C 四项 `[~]` 更新为 `[x]`，再进入阶段 D。
