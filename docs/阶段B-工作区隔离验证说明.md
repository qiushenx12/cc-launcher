# 阶段 B：工作区隔离验证说明

> 验收状态：2026-07-14 用户已确认通过。

## 已实现范围

- 三个 CLI 使用按 `CliKind` 独立缓存的运行时门禁。普通切换复用本 CLI 的检测结果，只有“重新检测”会强制刷新当前 CLI。
- 进入 CLI 工作区时，门禁遮罩会持续到项目发现、历史会话同步和最终列表排序完成，并等待最终排序渲染后再显示工作区，避免项目列表在用户眼前连续跳动。
- 项目、会话、项目终端、右侧辅助终端、PTY 事件和终端快照均携带 `cli_kind`。旧项目、旧会话和旧无前缀快照默认归属 Claude Code。
- 同一路径可分别创建 Claude Code、CodeX、OpenCode 项目；项目树、活动项目、活动会话和终端渲染按当前 CLI 过滤。
- CodeX 项目通过只读扫描 `CODEX_HOME/sessions`（默认 `~/.codex/sessions`）中每个 JSONL 的首条 `session_meta` 自动发现，只提取 `cwd` 与时间，不读取消息正文；不存在的目录和不兼容记录会跳过。新会话使用 `codex -C <项目目录>`；真实历史仍通过公开 App Server `thread/list` 按精确 `cwd` 同步桌面版 `vscode`、CLI `cli` 和 App Server 交互线程，点击后使用 `codex -C <项目目录> resume <threadId>` 精确恢复。原生恢复选择器作为接口失败时的降级入口。启用工作区前会检查 `--version`、`--help` 和 `resume --help`。
- OpenCode 使用 `opencode debug scrap` 发现项目，在项目目录执行 `opencode session list --format json --max-count <N>`，恢复时使用 `opencode --session <id>`。OpenCode 用 `worktree = "/"` 表示的全局项目会通过全局会话列表展开为实际 Windows 目录并去重；发现或列表命令失败时仍可手动选择目录并创建新会话。
- `projects.json` 保存改为临时文件校验、旧文件备份、原子替换；备份文件为同目录下的 `projects.json.bak`。加载和保存时还会修复早期往返中丢失类型的 `session-codex-*` / `session-opencode-*` 记录，先把混入其中的真实 Claude 会话移回同路径 Claude 项目，再恢复 CLI 类型、原生会话 ID、重复项目和活动选择。

## 自动检查结果

阶段 B 完成时已通过：

```text
npx vue-tsc --noEmit
npm run build
cargo check
cargo test
```

不启动开发服务器或 Tauri 应用；运行交互由用户按仓库约定验证。

## 人工验收清单

1. 进入 Claude Code，确认原有项目和历史会话仍可见并能继续对话。
2. 进入 CodeX，确认 JSONL `session_meta.cwd` 中仍存在的目录被自动建立为 CodeX 项目；再在 CodeX 与 OpenCode 中分别添加同一个目录，确认两个入口各自只显示本入口创建或发现的会话。
3. 在每个可用工作区按 `Ctrl+T` 新建会话、按 `Ctrl+Tab` 切换、按 `Ctrl+W` 关闭当前会话终端；切回另一 CLI，确认其会话和终端未被关闭或切换。
4. CodeX 通过门禁时，确认项目发现只依赖 JSONL 首条 `session_meta`，同一 `cwd` 的多个会话只生成一个项目；进入一个桌面版已有任务的目录，确认该任务按名称或首条提示出现在项目会话树，点击它应按线程 ID 恢复。再验证“新会话”进入所选目录、“原生恢复”显示 Codex 自带选择器。项目扫描或 App Server 读取失败时应显示降级提示，但不能阻止这两个入口或影响 Claude Code/OpenCode。
5. OpenCode 中确认普通 worktree 项目以及全局项目下的真实会话目录均可被发现；同一目录存在多个全局会话时项目只显示一次，但会话列表应完整。选择历史会话后应恢复对应 ID。若发现命令或 JSON 校验失败，应显示降级提示，并仍允许手动选择目录和新建会话。
6. 在项目和历史会话较多的入口间切换，确认准备遮罩持续到列表排序完成，揭开后项目顺序稳定，不再在用户眼前连续跳动。
7. 让任一 CLI 进入缺失或能力不足状态，切到其它入口再切回；应复用原门禁结果。点击“重新检测”时，只应刷新当前 CLI。

阶段 B 的入口、门禁、项目、会话、恢复、隔离和最终排序遮罩均已由用户验证通过，规划状态已更新为 `[x]`。
