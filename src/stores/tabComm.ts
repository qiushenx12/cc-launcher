import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { SnapshotEntry, TerminalSnapshot } from '@/types/terminal'
import type { AgentRole, PresetEntry } from '@/types/orchestration'

export const useTabCommStore = defineStore('tabComm', () => {
  // Permission config modal state
  const permModalOpen = ref(false)
  const permConfigTabId = ref<number | null>(null)
  const permEnabled = ref(false)
  const permAllowedTargets = ref<number[]>([])

  // Signal for OrchestrationManager to refresh connections after permission save
  const permissionSaved = ref<number | null>(null)

  // Snapshot list modal state
  const snapshotListOpen = ref(false)
  const snapshots = ref<SnapshotEntry[]>([])

  // Toast notification
  const toastMessage = ref('')
  const toastType = ref<'success' | 'error'>('success')
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  // Agent role config modal state
  const roleModalOpen = ref(false)
  const roleConfigTabId = ref<number | null>(null)
  const roleName = ref('')
  const roleDescription = ref('')
  const roleSystemPrompt = ref('')
  const tabRoles = ref<Record<number, AgentRole>>({})

  // Canvas state for snapshot save
  const snapshotCanvasState = ref<{
    items: { tabId: number; x: number; y: number }[]
    connections: { from: number; to: number }[]
  }>({ items: [], connections: [] })

  // Pending restore snapshot
  const pendingRestoreSnapshot = ref<TerminalSnapshot | null>(null)

  // Preset management state
  const presets = ref<PresetEntry[]>([])
  const presetModalOpen = ref(false)
  const presetModalMode = ref<'list' | 'create' | 'apply'>('list')

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    toastMessage.value = msg
    toastType.value = type
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastMessage.value = ''
      toastTimer = null
    }, 2000)
  }

  function openPermConfig(tabId: number) {
    permConfigTabId.value = tabId
    permModalOpen.value = true
    // Tauri 2 auto-converts Rust snake_case → camelCase JSON keys
    invoke<Record<string, unknown>>('get_tab_permission', { tabId })
      .then((raw) => {
        // Response is camelCase: { enabled, allowedTargets }
        const perm = raw as { enabled?: boolean; allowedTargets?: number[] }
        permEnabled.value = !!perm.enabled
        permAllowedTargets.value = perm.allowedTargets ?? []
      })
      .catch(() => {
        permEnabled.value = false
        permAllowedTargets.value = []
      })
  }

  function closePermConfig() {
    permModalOpen.value = false
    permConfigTabId.value = null
  }

  async function savePermission() {
    if (permConfigTabId.value === null) return
    try {
      // Tauri 2: Rust snake_case params → camelCase JSON keys
      const args = {
        tabId: permConfigTabId.value,
        enabled: permEnabled.value,
        allowedTargets: permAllowedTargets.value,
      }
      await invoke('set_tab_permission', args)
      showToast('权限保存成功')
      permissionSaved.value = permConfigTabId.value
      closePermConfig()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(`保存失败: ${msg}`, 'error')
    }
  }

  async function openSnapshotList() {
    try {
      snapshots.value = await invoke('list_terminal_snapshots')
      snapshotListOpen.value = true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(`加载快照列表失败: ${msg}`, 'error')
    }
  }

  function closeSnapshotList() {
    snapshotListOpen.value = false
  }

  async function saveSnapshot(projectPath: string) {
    try {
      await invoke('save_terminal_snapshot', {
        projectPath,
        canvas: snapshotCanvasState.value,
        roles: tabRoles.value,
      })
      // Refresh list
      snapshots.value = await invoke('list_terminal_snapshots')
      showToast('快照保存成功')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(`保存快照失败: ${msg}`, 'error')
    }
  }

  async function loadSnapshot(projectPath: string): Promise<TerminalSnapshot | null> {
    try {
      const snapshot = await invoke<TerminalSnapshot | null>('load_terminal_snapshot', { projectPath })
      return snapshot
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(`加载快照失败: ${msg}`, 'error')
      return null
    }
  }

  function clearPendingRestore() {
    pendingRestoreSnapshot.value = null
  }

  // Agent role config methods
  function openRoleConfig(tabId: number) {
    roleConfigTabId.value = tabId
    const existing = tabRoles.value[tabId]
    if (existing) {
      roleName.value = existing.name
      roleDescription.value = existing.description
      roleSystemPrompt.value = existing.systemPrompt
    } else {
      roleName.value = ''
      roleDescription.value = ''
      roleSystemPrompt.value = ''
    }
    roleModalOpen.value = true
  }

  function closeRoleConfig() {
    roleModalOpen.value = false
    roleConfigTabId.value = null
    roleName.value = ''
    roleDescription.value = ''
    roleSystemPrompt.value = ''
  }

  function saveRole() {
    if (roleConfigTabId.value === null) return
    tabRoles.value[roleConfigTabId.value] = {
      name: roleName.value.trim(),
      description: roleDescription.value.trim(),
      systemPrompt: roleSystemPrompt.value.trim(),
    }
    showToast('角色保存成功')
    closeRoleConfig()
  }

  function getRole(tabId: number): AgentRole | undefined {
    return tabRoles.value[tabId]
  }

  // Preset management methods
  async function loadPresets() {
    try {
      presets.value = await invoke<PresetEntry[]>('list_presets')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(`加载预设失败: ${msg}`, 'error')
    }
  }

  async function deletePreset(id: string) {
    try {
      await invoke('delete_preset', { id })
      await loadPresets()
      showToast('预设已删除')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(`删除预设失败: ${msg}`, 'error')
    }
  }

  function openPresetModal(mode: 'list' | 'create' | 'apply' = 'list') {
    presetModalMode.value = mode
    presetModalOpen.value = true
    if (mode === 'list') {
      loadPresets()
    }
  }

  function closePresetModal() {
    presetModalOpen.value = false
  }

  return {
    permModalOpen,
    permConfigTabId,
    permEnabled,
    permAllowedTargets,
    permissionSaved,
    snapshotListOpen,
    snapshots,
    toastMessage,
    toastType,
    openPermConfig,
    closePermConfig,
    savePermission,
    openSnapshotList,
    closeSnapshotList,
    saveSnapshot,
    loadSnapshot,
    showToast,
    roleModalOpen,
    roleConfigTabId,
    roleName,
    roleDescription,
    roleSystemPrompt,
    tabRoles,
    snapshotCanvasState,
    pendingRestoreSnapshot,
    openRoleConfig,
    closeRoleConfig,
    saveRole,
    getRole,
    clearPendingRestore,
    presets,
    presetModalOpen,
    presetModalMode,
    loadPresets,
    deletePreset,
    openPresetModal,
    closePresetModal,
  }
})
