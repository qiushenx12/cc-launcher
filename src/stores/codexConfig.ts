import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { confirm } from '@tauri-apps/plugin-dialog'
import type {
  CliProfileRef,
  CodexLaunchContext,
  CodexProfile,
  CodexProfilesPayload,
} from '@/types/config'

function emptyProfile(): CodexProfile {
  return {
    id: '',
    name: '',
    authMode: 'official',
    model: '',
    reasoningEffort: '',
    openaiBaseUrl: '',
    providerId: '',
    providerName: '',
    baseUrl: '',
    wireApi: 'responses',
    envKey: 'OPENAI_API_KEY',
    hasStoredApiKey: false,
    managedProfileName: '',
  }
}

function cloneProfile(profile: CodexProfile): CodexProfile {
  return JSON.parse(JSON.stringify(profile)) as CodexProfile
}

function serializeDraft(profile: CodexProfile, apiKeyInput: string, clearApiKey: boolean): string {
  return JSON.stringify({
    id: profile.id,
    name: profile.name,
    authMode: profile.authMode,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort,
    openaiBaseUrl: profile.openaiBaseUrl,
    providerId: profile.providerId,
    providerName: profile.providerName,
    baseUrl: profile.baseUrl,
    wireApi: profile.wireApi,
    envKey: profile.envKey,
    apiKeyInput,
    clearApiKey,
  })
}

export const useCodexConfigStore = defineStore('codexConfig', () => {
  const profiles = ref<CodexProfile[]>([])
  const order = ref<string[]>([])
  const activeProfileId = ref<string | null>(null)
  const globalProfileId = ref<string | null>(null)
  const selectedProfileId = ref<string | null>(null)
  const editingProfile = ref<CodexProfile>(emptyProfile())
  const apiKeyInput = ref('')
  const clearStoredApiKey = ref(false)
  const baseline = ref(serializeDraft(editingProfile.value, '', false))
  const loaded = ref(false)
  const loadError = ref('')
  const loading = ref(false)
  const saving = ref(false)
  const applying = ref(false)
  const modelsFetching = ref(false)
  const availableModels = ref<string[]>([])
  const syncToGlobal = ref(false)
  const statusMessage = ref('')
  const profilesPath = ref('')
  const globalConfigPath = ref('')
  const authPath = ref('')
  const globalConfigError = ref<string | null>(null)
  const authStatus = ref<CodexProfilesPayload['authStatus']>({
    mode: null,
    hasAuthFile: false,
    hasCredentials: false,
    error: null,
  })

  const orderedProfiles = computed(() => {
    const byId = new Map(profiles.value.map(profile => [profile.id, profile]))
    const ordered = order.value.map(id => byId.get(id)).filter(Boolean) as CodexProfile[]
    const included = new Set(ordered.map(profile => profile.id))
    return [...ordered, ...profiles.value.filter(profile => !included.has(profile.id))]
  })

  const activeProfile = computed(() =>
    profiles.value.find(profile => profile.id === activeProfileId.value) ?? null,
  )

  const activeProfileRef = computed<CliProfileRef | null>(() => activeProfile.value
    ? { cliKind: 'codex', profileId: activeProfile.value.id }
    : null)

  const isDirty = computed(() =>
    serializeDraft(editingProfile.value, apiKeyInput.value, clearStoredApiKey.value) !== baseline.value,
  )

  const authStatusLabel = computed(() => {
    if (authStatus.value.error) return `登录状态文件异常：${authStatus.value.error}`
    if (authStatus.value.mode === 'chatgpt') return '已检测到 Codex ChatGPT 登录'
    if (authStatus.value.mode) return `已检测到 Codex 登录模式：${authStatus.value.mode}`
    if (authStatus.value.hasCredentials) return '已检测到 Codex 登录凭据'
    return '未在 auth.json 中检测到登录；也可能由系统凭据存储管理'
  })

  function markClean() {
    baseline.value = serializeDraft(editingProfile.value, apiKeyInput.value, clearStoredApiKey.value)
  }

  function editProfile(profile: CodexProfile) {
    selectedProfileId.value = profile.id
    editingProfile.value = cloneProfile(profile)
    apiKeyInput.value = ''
    clearStoredApiKey.value = false
    availableModels.value = []
    syncToGlobal.value = false
    markClean()
  }

  function applyPayload(payload: CodexProfilesPayload, preferredProfileId?: string | null) {
    profiles.value = payload.profiles.map(cloneProfile)
    order.value = [...payload.order]
    activeProfileId.value = payload.activeProfileId
      && profiles.value.some(profile => profile.id === payload.activeProfileId)
      ? payload.activeProfileId
      : null
    globalProfileId.value = payload.globalProfileId
    profilesPath.value = payload.profilesPath
    globalConfigPath.value = payload.globalConfigPath
    authPath.value = payload.authPath
    globalConfigError.value = payload.globalConfigError
    authStatus.value = payload.authStatus
    const fallbackSelectedId = selectedProfileId.value
      && profiles.value.some(profile => profile.id === selectedProfileId.value)
      ? selectedProfileId.value
      : activeProfileId.value
        && profiles.value.some(profile => profile.id === activeProfileId.value)
        ? activeProfileId.value
        : orderedProfiles.value[0]?.id ?? null
    const selectedId = preferredProfileId
      && profiles.value.some(profile => profile.id === preferredProfileId)
      ? preferredProfileId
      : fallbackSelectedId
    const selected = profiles.value.find(profile => profile.id === selectedId)
    if (selected) editProfile(selected)
    else {
      selectedProfileId.value = null
      editingProfile.value = emptyProfile()
      apiKeyInput.value = ''
      clearStoredApiKey.value = false
      availableModels.value = []
      syncToGlobal.value = false
      markClean()
    }
  }

  async function loadProfiles(force = false) {
    if (loading.value || (loaded.value && !force)) return
    loading.value = true
    try {
      const payload = await invoke<CodexProfilesPayload>('load_codex_profiles')
      applyPayload(payload)
      loaded.value = true
      loadError.value = ''
      if (payload.globalConfigError) statusMessage.value = payload.globalConfigError
    } catch (error) {
      loaded.value = false
      loadError.value = `加载 CodeX 配置失败：${error}`
      statusMessage.value = loadError.value
    } finally {
      loading.value = false
    }
  }

  async function ensureLoaded() {
    await loadProfiles()
    if (!loaded.value) throw new Error(loadError.value || 'CodeX 配置尚未加载')
  }

  function discardChanges() {
    const selected = profiles.value.find(profile => profile.id === selectedProfileId.value)
    if (selected) editProfile(selected)
    else {
      selectedProfileId.value = null
      editingProfile.value = emptyProfile()
      apiKeyInput.value = ''
      clearStoredApiKey.value = false
      availableModels.value = []
      syncToGlobal.value = false
      markClean()
    }
  }

  async function confirmDiscardChanges(action: string): Promise<boolean> {
    if (!isDirty.value) return true
    const accepted = await confirm(
      `当前 CodeX 配置有未保存的修改。${action}将放弃这些修改，是否继续？`,
      { title: '未保存的 CodeX 配置', kind: 'warning' },
    )
    if (accepted) discardChanges()
    return accepted
  }

  async function selectProfile(profileId: string): Promise<boolean> {
    if (profileId === selectedProfileId.value) return true
    if (!(await confirmDiscardChanges('切换配置方案'))) return false
    const profile = profiles.value.find(item => item.id === profileId)
    if (!profile) return false
    editProfile(profile)
    statusMessage.value = profileId === activeProfileId.value
      ? `CodeX 配置 '${profile.name}' 当前应用中`
      : `已选择 CodeX 配置 '${profile.name}'，点击“应用此配置”后才会用于新启动的终端`
    return true
  }

  async function newProfile(): Promise<boolean> {
    if (!(await confirmDiscardChanges('新建配置方案'))) return false
    selectedProfileId.value = null
    editingProfile.value = emptyProfile()
    apiKeyInput.value = ''
    clearStoredApiKey.value = false
    availableModels.value = []
    syncToGlobal.value = false
    markClean()
    return true
  }

  async function saveProfile(): Promise<boolean> {
    if (saving.value) return false
    saving.value = true
    const requestedGlobalSync = syncToGlobal.value
    const profile = cloneProfile(editingProfile.value)
    if (!profile.id) profile.id = `profile-${crypto.randomUUID()}`
    const nextOrder = order.value.includes(profile.id) ? [...order.value] : [...order.value, profile.id]
    try {
      const payload = await invoke<CodexProfilesPayload>('save_codex_profile', {
        request: {
          profile,
          apiKey: apiKeyInput.value.trim() || null,
          clearApiKey: clearStoredApiKey.value,
          order: nextOrder,
          activeProfileId: activeProfileId.value,
        },
      })
      applyPayload(payload, profile.id)
      syncToGlobal.value = requestedGlobalSync
      statusMessage.value = `CodeX 配置 '${editingProfile.value.name}' 已保存并通过磁盘校验`
      return true
    } catch (error) {
      statusMessage.value = `保存 CodeX 配置失败，表单内容已保留：${error}`
      return false
    } finally {
      saving.value = false
    }
  }

  async function applyProfile(): Promise<boolean> {
    const profile = profiles.value.find(item => item.id === selectedProfileId.value)
    if (!profile || isDirty.value || applying.value) return false
    const applyToGlobal = syncToGlobal.value
    if (profile.id === activeProfileId.value
      && (!applyToGlobal || profile.id === globalProfileId.value)) return true

    applying.value = true
    try {
      const payload = await invoke<CodexProfilesPayload>('apply_codex_profile', {
        request: {
          profileId: profile.id,
          applyToGlobal,
        },
      })
      applyPayload(payload, profile.id)
      if (payload.activeProfileId !== profile.id) {
        throw new Error('活动方案写入后回读不一致')
      }
      if (applyToGlobal && payload.globalProfileId !== profile.id) {
        throw new Error('全局方案写入后回读不一致')
      }
      syncToGlobal.value = applyToGlobal
      statusMessage.value = applyToGlobal
        ? `CodeX 配置 '${profile.name}' 已应用到启动器和全局；重启外部终端及 CodeX 桌面端后生效`
        : `CodeX 配置 '${profile.name}' 已应用；新启动或重新打开的 CodeX 终端将使用该配置`
      return true
    } catch (error) {
      await loadProfiles(true)
      syncToGlobal.value = applyToGlobal
      statusMessage.value = `应用 CodeX 配置失败：${error}`
      return false
    } finally {
      applying.value = false
    }
  }

  async function fetchModels(): Promise<boolean> {
    if (editingProfile.value.authMode !== 'custom') {
      statusMessage.value = '官方登录模式使用 Codex 提供的模型选择，无需从第三方地址获取'
      return false
    }
    if (!editingProfile.value.baseUrl.trim()) {
      statusMessage.value = '请先输入第三方 Base URL'
      return false
    }
    if (modelsFetching.value) return false
    modelsFetching.value = true
    availableModels.value = []
    try {
      const models = await invoke<string[]>('fetch_codex_models', {
        request: {
          profileId: editingProfile.value.id,
          baseUrl: editingProfile.value.baseUrl,
          apiKey: apiKeyInput.value.trim() || null,
          envKey: editingProfile.value.envKey,
        },
      })
      availableModels.value = models
      statusMessage.value = `已获取 ${models.length} 个第三方模型`
      return true
    } catch (error) {
      statusMessage.value = `获取模型失败：${error}`
      return false
    } finally {
      modelsFetching.value = false
    }
  }

  async function deleteProfile(profileId: string): Promise<boolean> {
    const profile = profiles.value.find(item => item.id === profileId)
    if (!profile) return false
    if (!(await confirmDiscardChanges(`删除配置“${profile.name}”`))) return false
    const globalNotice = globalProfileId.value === profileId
      ? '该方案曾同步到全局；删除方案不会撤销已写入的全局 config.toml，请先同步另一个全局方案。'
      : ''
    const accepted = await confirm(
      `确定删除 CodeX 配置“${profile.name}”吗？对应的启动器 profile TOML 和加密凭据也会删除。${globalNotice}`,
      { title: '删除 CodeX 配置', kind: 'warning' },
    )
    if (!accepted) return false
    const nextOrder = order.value.filter(id => id !== profileId)
    const nextActive = activeProfileId.value === profileId
      ? null
      : activeProfileId.value
    const nextSelected = selectedProfileId.value === profileId
      ? nextOrder[0] ?? null
      : selectedProfileId.value
    try {
      const payload = await invoke<CodexProfilesPayload>('delete_codex_profile', {
        request: {
          profileId,
          order: nextOrder,
          activeProfileId: nextActive,
        },
      })
      applyPayload(payload, nextSelected)
      const activeNotice = activeProfileId.value ? '' : '；当前没有应用启动器方案'
      const removedGlobalNotice = globalNotice ? '；已写入的全局配置保持不变' : ''
      statusMessage.value = `CodeX 配置 '${profile.name}' 已删除${activeNotice}${removedGlobalNotice}`
      return true
    } catch (error) {
      statusMessage.value = `删除 CodeX 配置失败：${error}`
      return false
    }
  }

  async function resolveLaunchContext(profileId: string): Promise<CodexLaunchContext> {
    await ensureLoaded()
    return invoke<CodexLaunchContext>('resolve_codex_profile', { profileId })
  }

  watch(apiKeyInput, (value, previous) => {
    if (value) clearStoredApiKey.value = false
    if (value !== previous) availableModels.value = []
  })

  watch(
    () => [editingProfile.value.authMode, editingProfile.value.baseUrl],
    () => { availableModels.value = [] },
  )

  return {
    profiles,
    order,
    orderedProfiles,
    activeProfileId,
    globalProfileId,
    selectedProfileId,
    activeProfile,
    activeProfileRef,
    editingProfile,
    apiKeyInput,
    clearStoredApiKey,
    isDirty,
    loaded,
    loadError,
    loading,
    saving,
    applying,
    modelsFetching,
    availableModels,
    syncToGlobal,
    statusMessage,
    profilesPath,
    globalConfigPath,
    authPath,
    globalConfigError,
    authStatus,
    authStatusLabel,
    loadProfiles,
    ensureLoaded,
    selectProfile,
    newProfile,
    saveProfile,
    applyProfile,
    fetchModels,
    deleteProfile,
    discardChanges,
    confirmDiscardChanges,
    resolveLaunchContext,
  }
})
