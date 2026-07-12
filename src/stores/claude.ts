import { defineStore } from 'pinia'
import { ref, computed, nextTick, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { confirm } from '@tauri-apps/plugin-dialog'
import type { ClaudeSettings, SessionEntry } from '@/types/config'

export interface ClaudeCodeCheckResult {
  installed: boolean
  path: string | null
  version: string | null
  message: string
}

const KNOWN_ENV_KEYS = new Set([
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'DISABLE_AUTOUPDATER',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
])

export const useClaudeStore = defineStore('claude', () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const configs = ref<Record<string, Record<string, string>>>({})
  const configOrder = ref<string[]>([])
  const activeConfigName = ref<string | null>(null)
  const editingConfig = ref<{ name: string; vars: Record<string, string> }>({
    name: '',
    vars: {},
  })
  const activeSource = ref<'env' | 'manual' | string>('env')
  const sessions = ref<SessionEntry[]>([])
  const sessionDisplayCount = ref(10)
  const availableModels = ref<string[]>([])
  const modelsFetching = ref(false)
  const launchDir = ref('')
  const launchDirHistory = ref<string[]>([])
  const claudeExePath = ref<string | null>(null)
  const claudeInstalled = ref(false)
  const skipPermissions = ref(false)
  const awaySummaryDisabled = ref(false)
  const useBuiltinTerminal = ref(false)
  const projectDropPathMode = ref<'filename' | 'relative'>('relative')
  const switchToTerminal = ref(false)
  const switchToProject = ref(false)
  const scope = ref<'user' | 'system'>('user')
  const statusMessage = ref('')

  // ── Computed ───────────────────────────────────────────────────────────────
  const visibleSessions = computed(() =>
    sessions.value.slice(0, sessionDisplayCount.value)
  )

  const hasMoreSessions = computed(() =>
    sessions.value.length > sessionDisplayCount.value
  )

  // ── Actions ────────────────────────────────────────────────────────────────
  async function loadConfigs() {
    try {
      const result = await invoke<Record<string, Record<string, string>>>('load_claude_configs')
      configs.value = result

      // Load saved order; fall back to Object.keys if none saved
      try {
        const savedOrder = await invoke<string[]>('load_config_order', { key: 'claude' })
        if (savedOrder && savedOrder.length > 0) {
          // Only keep names that actually exist in the loaded configs
          const validOrder = savedOrder.filter(n => n in result)
          // Append any new names not in the saved order
          const extra = Object.keys(result).filter(n => !validOrder.includes(n))
          configOrder.value = [...validOrder, ...extra]
        } else {
          configOrder.value = Object.keys(result)
        }
      } catch {
        configOrder.value = Object.keys(result)
      }

      // Load saved useBuiltinTerminal
      try {
        useBuiltinTerminal.value = await invoke<boolean>('load_use_builtin_terminal', { key: 'claude' })
      } catch {
        // keep default false
      }

      // Load saved project drop path mode
      try {
        const savedMode = await invoke<string>('load_project_drop_path_mode', { key: 'claude' })
        if (savedMode === 'filename' || savedMode === 'relative') {
          projectDropPathMode.value = savedMode
        }
      } catch {
        // keep default relative
      }

      // Auto-select the config that matches the current process environment
      const allVarNames = new Set<string>()
      for (const vars of Object.values(result)) {
        for (const k of Object.keys(vars)) allVarNames.add(k)
      }
      if (allVarNames.size > 0) {
        try {
          const currentEnv = await invoke<Record<string, string>>('get_current_env_vars', {
            varNames: Array.from(allVarNames),
          })
          for (const name of configOrder.value) {
            const vars = result[name]
            const matches = Object.entries(vars).every(([k, v]) => {
              if (!v) return true // skip empty values
              return currentEnv[k] === v
            })
            if (matches && Object.keys(vars).length > 0) {
              selectConfig(name)
              break
            }
          }
        } catch {
          // ignore — env var lookup is best-effort
        }
      }
    } catch (e) {
      statusMessage.value = `加载配置失败: ${e}`
    }
  }

  function selectConfig(name: string) {
    activeConfigName.value = name
    const vars = configs.value[name] ?? {}
    editingConfig.value = { name, vars: { ...vars } }
    activeSource.value = name
  }

  function newConfig() {
    activeConfigName.value = null
    editingConfig.value = { name: '', vars: {} }
    activeSource.value = 'manual'
  }

  async function saveConfig() {
    const name = editingConfig.value.name.trim()
    if (!name) {
      statusMessage.value = '请输入配置名称'
      return
    }
    // Handle rename: if activeConfigName differs from new name, replace in order
    if (activeConfigName.value && activeConfigName.value !== name) {
      const idx = configOrder.value.indexOf(activeConfigName.value)
      if (idx !== -1) configOrder.value[idx] = name
      delete configs.value[activeConfigName.value]
    }
    configs.value[name] = Object.fromEntries(
      Object.entries(editingConfig.value.vars).filter(
        ([k, v]) => KNOWN_ENV_KEYS.has(k) && v !== '' && v !== undefined && v !== null
      )
    )
    if (!configOrder.value.includes(name)) {
      configOrder.value.push(name)
    }
    await persistConfigs()
    activeConfigName.value = name
    activeSource.value = name
    statusMessage.value = `配置 '${name}' 已保存`
  }

  async function deleteConfig(name: string) {
    delete configs.value[name]
    configOrder.value = configOrder.value.filter(n => n !== name)
    if (activeConfigName.value === name) {
      activeConfigName.value = null
      editingConfig.value = { name: '', vars: {} }
      activeSource.value = 'env'
    }
    await persistConfigs()
    statusMessage.value = `配置 '${name}' 已删除`
  }

  async function reorderConfigs(newOrder: string[]) {
    configOrder.value = newOrder
    await persistConfigs()
  }

  async function persistConfigs() {
    try {
      await invoke('save_claude_configs', {
        configs: configs.value,
      })
      await invoke('save_config_order', { key: 'claude', order: configOrder.value })
    } catch (e) {
      statusMessage.value = `保存配置失败: ${e}`
    }
  }

  // Persist useBuiltinTerminal whenever it changes
  watch(useBuiltinTerminal, async (val) => {
    try {
      await invoke('save_use_builtin_terminal', { key: 'claude', value: val })
    } catch {
      // ignore
    }
  })

  // Persist projectDropPathMode whenever it changes
  watch(projectDropPathMode, async (val) => {
    try {
      await invoke('save_project_drop_path_mode', { key: 'claude', value: val })
    } catch {
      // ignore
    }
  })

  async function applyToRegistry() {
    const vars = editingConfig.value.vars
    // Build a full map: for every known env key, use the config value or empty string.
    // Empty strings tell the backend to delete the registry entry.
    const fullVars: Record<string, string> = {}
    for (const k of KNOWN_ENV_KEYS) {
      fullVars[k] = vars[k] ?? ''
    }
    const nonEmpty = Object.entries(fullVars).filter(([, v]) => v)
    if (nonEmpty.length === 0) {
      statusMessage.value = '没有需要应用的环境变量'
      return
    }
    const scopeLabel = scope.value === 'system' ? '系统（所有用户）' : '当前用户'
    const confirmed = await confirm(
      `将以下 ${nonEmpty.length} 个环境变量写入注册表（范围: ${scopeLabel}）:\n\n` +
        nonEmpty.map(([k, v]) => `  ${k}=${v}`).join('\n'),
      { title: '确认应用环境变量', kind: 'warning' }
    )
    if (!confirmed) return
    try {
      await invoke('apply_env_vars', {
        vars: fullVars,
        scope: scope.value,
      })
      statusMessage.value = `已应用到${scope.value === 'system' ? '系统' : '用户'}环境变量`
      // WM_SETTINGCHANGE broadcast can reset the DWM dark-mode attribute;
      // re-apply the current theme after a short delay.
      const currentTheme = document.documentElement.getAttribute('data-theme')
      if (currentTheme) {
        setTimeout(() => {
          invoke('set_titlebar_theme', { dark: currentTheme === 'dark' }).catch(() => {})
        }, 300)
      }
    } catch (e) {
      statusMessage.value = `应用失败: ${e}`
    }
  }

  async function fetchModels() {
    const baseUrl = editingConfig.value.vars['ANTHROPIC_BASE_URL'] ?? ''
    const authToken = editingConfig.value.vars['ANTHROPIC_AUTH_TOKEN'] ?? ''
    if (!baseUrl) {
      statusMessage.value = '请先输入 ANTHROPIC_BASE_URL'
      return
    }
    modelsFetching.value = true
    availableModels.value = []
    try {
      const models = await invoke<string[]>('fetch_claude_models', { baseUrl, authToken })
      availableModels.value = models
      statusMessage.value = `已获取 ${models.length} 个模型`
    } catch (e) {
      statusMessage.value = `获取模型失败: ${e}`
    } finally {
      modelsFetching.value = false
    }
  }

  async function loadSessions(options: { resetDisplayCount?: boolean } = {}) {
    const resetDisplayCount = options.resetDisplayCount ?? true
    try {
      const result = await invoke<SessionEntry[]>('load_claude_sessions', {
        targetDir: launchDir.value,
      })
      sessions.value = result ?? []
      if (resetDisplayCount) {
        sessionDisplayCount.value = 10
      } else {
        sessionDisplayCount.value = Math.max(10, Math.min(sessionDisplayCount.value, sessions.value.length || 10))
      }
    } catch (e) {
      sessions.value = []
    }
  }

  function loadMoreSessions() {
    sessionDisplayCount.value += 10
  }

  async function loadRecentProjects() {
    try {
      const result = await invoke<string[]>('load_claude_recent_projects')
      launchDirHistory.value = result ?? []
    } catch {
      launchDirHistory.value = []
    }
  }

  async function loadSettings() {
    try {
      const result = await invoke<ClaudeSettings>('load_claude_settings')
      skipPermissions.value = result.skipPermissions
      awaySummaryDisabled.value = result.awaySummaryDisabled
    } catch {
      // use defaults
    }
  }

  async function saveSettings() {
    try {
      await invoke('save_claude_settings', {
        settings: {
          skipPermissions: skipPermissions.value,
          awaySummaryDisabled: awaySummaryDisabled.value,
        }
      })
    } catch (e) {
      statusMessage.value = `保存设置失败: ${e}`
    }
  }

  async function checkClaudeCode(): Promise<ClaudeCodeCheckResult> {
    try {
      const result = await invoke<ClaudeCodeCheckResult>('check_claude_code_installed')
      claudeExePath.value = result.installed ? result.path : null
      claudeInstalled.value = result.installed
      return result
    } catch (error) {
      claudeExePath.value = null
      claudeInstalled.value = false
      return {
        installed: false,
        path: null,
        version: null,
        message: `无法检查 Claude Code：${String(error)}`,
      }
    }
  }

  async function findClaudeExe() {
    const result = await checkClaudeCode()
    return result.installed ? result.path : null
  }

  async function launchClaude(sessionId?: string) {
    if (!claudeExePath.value) {
      statusMessage.value = 'Claude Code 未安装'
      return
    }

    const args: string[] = []
    if (skipPermissions.value) args.push('--dangerously-skip-permissions')
    if (sessionId) args.push('-r', sessionId)

    const envVars: Record<string, string> = {}
    if (editingConfig.value) {
      for (const [k, v] of Object.entries(editingConfig.value.vars)) {
        if (v) envVars[k] = v
      }
    }

    try {
      if (useBuiltinTerminal.value) {
        if (!launchDir.value.trim()) {
          statusMessage.value = '启动目录为空，请先设置启动目录'
          return
        }

        // Switch to Project before creating the xterm instance, so the
        // terminal container is visible when xterm measures itself.
        switchToProject.value = true
        await nextTick()

        const { useProjectStore } = await import('./project')
        const projectStore = useProjectStore()
        const session = await projectStore.launchClaudeFromConfig(sessionId)
        if (session) {
          statusMessage.value = 'Claude Code 已在项目终端启动'
        }
      } else {
        await invoke('launch_claude', {
          exe: claudeExePath.value,
          envVars,
          args,
          cwd: launchDir.value || null,
        })
        statusMessage.value = 'Claude Code 已启动'
      }
    } catch (e) {
      statusMessage.value = `启动失败: ${e}`
    }
  }

  async function loadLaunchDir() {
    try {
      const dir = await invoke<string>('load_launch_dir', { key: 'claude' })
      launchDir.value = dir ?? ''
    } catch {
      launchDir.value = ''
    }
  }

  async function saveLaunchDir() {
    try {
      await invoke('save_launch_dir', { key: 'claude', dir: launchDir.value })
    } catch {
      // ignore
    }
  }

  return {
    // state
    configs,
    configOrder,
    activeConfigName,
    editingConfig,
    activeSource,
    sessions,
    sessionDisplayCount,
    availableModels,
    modelsFetching,
    launchDir,
    launchDirHistory,
    claudeExePath,
    claudeInstalled,
    skipPermissions,
    awaySummaryDisabled,
    useBuiltinTerminal,
    projectDropPathMode,
    switchToTerminal,
    switchToProject,
    scope,
    statusMessage,
    // computed
    visibleSessions,
    hasMoreSessions,
    // actions
    loadConfigs,
    selectConfig,
    newConfig,
    saveConfig,
    deleteConfig,
    reorderConfigs,
    applyToRegistry,
    fetchModels,
    loadSessions,
    loadMoreSessions,
    loadRecentProjects,
    loadSettings,
    saveSettings,
    checkClaudeCode,
    findClaudeExe,
    launchClaude,
    loadLaunchDir,
    saveLaunchDir,
  }
})
