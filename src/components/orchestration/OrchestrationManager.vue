<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useTerminalStore } from '@/stores/terminal'
import { useTabCommStore } from '@/stores/tabComm'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { PtyTitle, TerminalSnapshot } from '@/types/terminal'
import type { AgentRole, OrchestrationPreset, VirtualAgent, VirtualConnection } from '@/types/orchestration'
import TabPermissionModal from '../terminal/TabPermissionModal.vue'
import AgentRoleModal from './AgentRoleModal.vue'
import SnapshotManager from '../terminal/SnapshotManager.vue'
import PresetManager from './PresetManager.vue'
import ToastNotification from '@/components/common/ToastNotification.vue'
import { getDefaultShell } from '@/composables/useDefaultShell'

const store = useTerminalStore()
const tabComm = useTabCommStore()

// Snapshot path — default to first tab's launch dir or empty
const snapshotPath = ref('')

// Canvas items — tabs that have been dragged onto the canvas
interface CanvasItem {
  tabId: number
  x: number
  y: number
}

const canvasItems = ref<CanvasItem[]>([])
const draggedTabId = ref<number | null>(null)
const dragOverCanvas = ref(false)

const canvasRef = ref<HTMLDivElement | null>(null)

// ── Connections ────────────────────────────────────────────────────────────

interface CanvasConnection {
  from: number
  to: number
}

const connections = ref<CanvasConnection[]>([])
const selectedConnection = ref<CanvasConnection | null>(null)

// Permission cache
interface TabPermission {
  enabled: boolean
  allowedTargets: number[]
}

const tabPermissions = ref<Record<number, TabPermission>>({})

function syncCanvasState() {
  tabComm.snapshotCanvasState = {
    items: canvasItems.value.map((i) => ({ tabId: i.tabId, x: i.x, y: i.y })),
    connections: connections.value.map((c) => ({ from: c.from, to: c.to })),
  }
}

watch(canvasItems, syncCanvasState, { deep: true })
watch(connections, syncCanvasState, { deep: true })

async function fetchTabPermission(tabId: number) {
  try {
    const raw = await invoke<Record<string, unknown>>('get_tab_permission', { tabId })
    const perm = raw as { enabled?: boolean; allowedTargets?: number[] }
    tabPermissions.value[tabId] = {
      enabled: !!perm.enabled,
      allowedTargets: perm.allowedTargets ?? [],
    }
  } catch {
    tabPermissions.value[tabId] = { enabled: false, allowedTargets: [] }
  }
}

function refreshConnections() {
  // Rebuild connections based on mutual permissions
  const newConnections: CanvasConnection[] = []
  const tabIds = Object.keys(tabPermissions.value).map(Number)
  for (let i = 0; i < tabIds.length; i++) {
    for (let j = i + 1; j < tabIds.length; j++) {
      const a = tabIds[i]
      const b = tabIds[j]
      const aPerm = tabPermissions.value[a]
      const bPerm = tabPermissions.value[b]
      if (aPerm?.enabled && bPerm?.enabled && aPerm.allowedTargets.includes(b) && bPerm.allowedTargets.includes(a)) {
        newConnections.push({ from: Math.min(a, b), to: Math.max(a, b) })
      }
    }
  }
  connections.value = newConnections
  selectedConnection.value = null
}

async function saveConnection(a: number, b: number) {
  if (a === b) return
  const from = Math.min(a, b)
  const to = Math.max(a, b)

  // Ensure permissions are loaded
  if (!tabPermissions.value[from]) await fetchTabPermission(from)
  if (!tabPermissions.value[to]) await fetchTabPermission(to)

  const aPerm = tabPermissions.value[from]
  const bPerm = tabPermissions.value[to]

  const aTargets = new Set(aPerm.allowedTargets)
  const bTargets = new Set(bPerm.allowedTargets)
  aTargets.add(to)
  bTargets.add(from)

  try {
    await invoke('set_tab_permission', {
      tabId: from,
      enabled: true,
      allowedTargets: Array.from(aTargets),
    })
    await invoke('set_tab_permission', {
      tabId: to,
      enabled: true,
      allowedTargets: Array.from(bTargets),
    })

    tabPermissions.value[from] = { enabled: true, allowedTargets: Array.from(aTargets) }
    tabPermissions.value[to] = { enabled: true, allowedTargets: Array.from(bTargets) }

    if (!connections.value.some((c) => c.from === from && c.to === to)) {
      connections.value.push({ from, to })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    tabComm.showToast(`连接失败: ${msg}`, 'error')
  }
}

async function deleteConnection(conn: CanvasConnection) {
  const a = conn.from
  const b = conn.to

  const aPerm = tabPermissions.value[a]
  const bPerm = tabPermissions.value[b]

  if (aPerm) {
    const aTargets = aPerm.allowedTargets.filter((id) => id !== b)
    try {
      await invoke('set_tab_permission', {
        tabId: a,
        enabled: aTargets.length > 0 || aPerm.enabled,
        allowedTargets: aTargets,
      })
      tabPermissions.value[a] = { ...aPerm, allowedTargets: aTargets }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      tabComm.showToast(`删除连接失败: ${msg}`, 'error')
      return
    }
  }

  if (bPerm) {
    const bTargets = bPerm.allowedTargets.filter((id) => id !== a)
    try {
      await invoke('set_tab_permission', {
        tabId: b,
        enabled: bTargets.length > 0 || bPerm.enabled,
        allowedTargets: bTargets,
      })
      tabPermissions.value[b] = { ...bPerm, allowedTargets: bTargets }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      tabComm.showToast(`删除连接失败: ${msg}`, 'error')
      return
    }
  }

  connections.value = connections.value.filter((c) => !(c.from === a && c.to === b))
  selectedConnection.value = null
}

// ── Card edge point calculation ────────────────────────────────────────────

const cardWidth = 180
const cardHeight = 100

function getCardEdgePoint(
  tabId: number,
  edge: 'top' | 'bottom' | 'left' | 'right'
): { x: number; y: number } {
  const item = canvasItems.value.find((i) => i.tabId === tabId)
  if (!item) return { x: 0, y: 0 }
  switch (edge) {
    case 'top':
      return { x: item.x + cardWidth / 2, y: item.y }
    case 'bottom':
      return { x: item.x + cardWidth / 2, y: item.y + cardHeight }
    case 'left':
      return { x: item.x, y: item.y + cardHeight / 2 }
    case 'right':
      return { x: item.x + cardWidth, y: item.y + cardHeight / 2 }
  }
}

// ── Drawing connection (drag from anchor) ──────────────────────────────────

const isDrawingConnection = ref(false)
const drawFromTabId = ref<number | null>(null)
const drawFromEdge = ref<'top' | 'bottom' | 'left' | 'right'>('right')
const drawMousePos = ref({ x: 0, y: 0 })

function onAnchorMouseDown(tabId: number, edge: 'top' | 'bottom' | 'left' | 'right', e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()
  isDrawingConnection.value = true
  drawFromTabId.value = tabId
  drawFromEdge.value = edge
  const pt = getCardEdgePoint(tabId, edge)
  drawMousePos.value = pt
}

function getCardAtPosition(clientX: number, clientY: number): number | null {
  const canvasRect = canvasRef.value?.getBoundingClientRect()
  if (!canvasRect) return null
  const x = clientX - canvasRect.left
  const y = clientY - canvasRect.top
  for (const item of canvasItems.value) {
    if (
      x >= item.x &&
      x <= item.x + cardWidth &&
      y >= item.y &&
      y <= item.y + cardHeight
    ) {
      return item.tabId
    }
  }
  return null
}

// ── Keyboard delete ────────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete' && selectedConnection.value) {
    const target = e.target as HTMLElement
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return
    }
    deleteConnection(selectedConnection.value)
  }
}

// Check if a tab is already on the canvas
function isOnCanvas(tabId: number): boolean {
  return canvasItems.value.some((item) => item.tabId === tabId)
}

// Get tab info by id
function getTab(tabId: number) {
  return store.tabs.find((t) => t.id === tabId)
}

// ── Drag handlers ──────────────────────────────────────────────────────────

function onDragStart(tabId: number, e: DragEvent) {
  draggedTabId.value = tabId
  e.dataTransfer?.setData('text/plain', String(tabId))
  e.dataTransfer!.effectAllowed = 'copy'
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
  dragOverCanvas.value = true
}

function onDragLeave(e: DragEvent) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    const { clientX, clientY } = e
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      dragOverCanvas.value = false
    }
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOverCanvas.value = false
  const tabId = draggedTabId.value
  if (tabId === null) return

  addTabToCanvas(tabId, e.clientX, e.clientY)
  draggedTabId.value = null
}

function removeFromCanvas(tabId: number) {
  const idx = canvasItems.value.findIndex((item) => item.tabId === tabId)
  if (idx !== -1) canvasItems.value.splice(idx, 1)
}

// ── Permission config ──────────────────────────────────────────────────────

function openPermConfig(tabId: number) {
  tabComm.openPermConfig(tabId)
}

// ── Role config ────────────────────────────────────────────────────────────

function openRoleConfig(tabId: number) {
  tabComm.openRoleConfig(tabId)
}

// ── System prompt auto-injection ───────────────────────────────────────────

const injectedTabs = new Set<number>()
const pendingInjections = new Map<number, ReturnType<typeof setTimeout>>()

async function injectSystemPrompt(tabId: number, role: AgentRole) {
  const prompt = `从现在开始，你的角色是：${role.name}。\n${role.description ? role.description + '\n' : ''}${role.systemPrompt}\n请始终以上述角色身份回应后续所有请求。`
  try {
    await invoke('pty_write', { tabId, data: prompt + '\r\n' })
    injectedTabs.add(tabId)
  } catch (e) {
    console.error('注入角色失败:', e)
  } finally {
    pendingInjections.delete(tabId)
  }
}

// Clean up injection tracking when tabs are closed
watch(
  () => store.tabs.map((t) => t.id),
  (activeTabIds) => {
    const activeSet = new Set(activeTabIds)
    for (const tabId of Array.from(injectedTabs)) {
      if (!activeSet.has(tabId)) {
        injectedTabs.delete(tabId)
      }
    }
    for (const [tabId, timeoutId] of Array.from(pendingInjections.entries())) {
      if (!activeSet.has(tabId)) {
        clearTimeout(timeoutId)
        pendingInjections.delete(tabId)
      }
    }
  },
  { deep: true }
)

// ── Mouse-event fallback drag (sidebar → canvas) ───────────────────────────

const isMouseDragging = ref(false)
const mouseDragTabId = ref<number | null>(null)
const ghostPos = ref({ x: 0, y: 0 })

function onSidebarMouseDown(tabId: number, e: MouseEvent) {
  // Only left-click triggers fallback drag
  if (e.button !== 0) return
  isMouseDragging.value = true
  mouseDragTabId.value = tabId
  ghostPos.value = { x: e.clientX, y: e.clientY }
}

async function addTabToCanvas(tabId: number, clientX: number, clientY: number) {
  if (!isOnCanvas(tabId)) {
    const rect = canvasRef.value!.getBoundingClientRect()
    const x = clientX - rect.left - 80 // center the card roughly
    const y = clientY - rect.top - 30
    canvasItems.value.push({
      tabId,
      x: Math.max(8, x),
      y: Math.max(8, y),
    })
    await fetchTabPermission(tabId)
    refreshConnections()
    syncCanvasState()
  }
}

function onWindowMouseMove(e: MouseEvent) {
  if (isMouseDragging.value) {
    ghostPos.value = { x: e.clientX, y: e.clientY }
  }
  if (isMovingCard.value) {
    const canvasRect = canvasRef.value?.getBoundingClientRect()
    if (!canvasRect) return
    const cardWidth = 180
    const cardHeight = 100 // approximate card height
    let newX = e.clientX - canvasRect.left - moveOffset.value.x
    let newY = e.clientY - canvasRect.top - moveOffset.value.y
    newX = Math.max(0, Math.min(canvasRect.width - cardWidth, newX))
    newY = Math.max(0, Math.min(canvasRect.height - cardHeight, newY))
    const item = canvasItems.value.find((i) => i.tabId === movingCardId.value)
    if (item) {
      item.x = newX
      item.y = newY
    }
  }
  if (isDrawingConnection.value) {
    const canvasRect = canvasRef.value?.getBoundingClientRect()
    if (canvasRect) {
      drawMousePos.value = {
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top,
      }
    }
  }
}

async function onWindowMouseUp(e: MouseEvent) {
  if (isMouseDragging.value) {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (rect && mouseDragTabId.value !== null) {
      const { clientX, clientY } = e
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        await addTabToCanvas(mouseDragTabId.value, clientX, clientY)
      }
    }
    isMouseDragging.value = false
    mouseDragTabId.value = null
  }
  if (isMovingCard.value) {
    isMovingCard.value = false
    movingCardId.value = null
  }
  if (isDrawingConnection.value && drawFromTabId.value !== null) {
    const targetTabId = getCardAtPosition(e.clientX, e.clientY)
    if (targetTabId !== null && targetTabId !== drawFromTabId.value) {
      await saveConnection(drawFromTabId.value, targetTabId)
    }
    isDrawingConnection.value = false
    drawFromTabId.value = null
  }
}

// ── Card internal move (canvas → canvas) ───────────────────────────────────

const isMovingCard = ref(false)
const movingCardId = ref<number | null>(null)
const moveOffset = ref({ x: 0, y: 0 })

function onCardMouseDown(item: CanvasItem, e: MouseEvent) {
  // Only left-click, and ignore clicks on buttons
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('button')) return

  isMovingCard.value = true
  movingCardId.value = item.tabId
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  moveOffset.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  }
}

// ── Preset management ──────────────────────────────────────────────────────

const showPresetManager = ref(false)
const presetManagerMode = ref<'list' | 'create' | 'apply'>('list')

function openPresetManager() {
  presetManagerMode.value = 'list'
  showPresetManager.value = true
  tabComm.loadPresets()
}

function openCreatePreset() {
  presetManagerMode.value = 'create'
  showPresetManager.value = true
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

async function saveCurrentAsPreset(name: string, description: string) {
  // 将当前画布转换为预设
  const agents: VirtualAgent[] = canvasItems.value.map((item) => {
    const tab = store.tabs.find((t) => t.id === item.tabId)
    const role = tabComm.getRole(item.tabId)
    return {
      id: `agent-${item.tabId}-${Date.now()}`,
      name: tab?.title || `Agent ${item.tabId}`,
      role: role || { name: '未命名角色', description: '', systemPrompt: '' },
      launchConfig: {
        agentType: 'terminal' as const,
        cmd: getDefaultShell(),
        env: {},
        cwd: null,
      },
    }
  })

  // 建立稳定的 tabId -> agentId 映射
  const idMap: Record<number, string> = {}
  canvasItems.value.forEach((item, idx) => {
    idMap[item.tabId] = agents[idx].id
  })

  const layout: Record<string, { x: number; y: number }> = {}
  for (const item of canvasItems.value) {
    const agentId = idMap[item.tabId]
    if (agentId) {
      layout[agentId] = { x: item.x, y: item.y }
    }
  }

  const virtualConnections: VirtualConnection[] = connections.value.map((conn) => ({
    from: idMap[conn.from],
    to: idMap[conn.to],
  }))

  const preset: OrchestrationPreset = {
    id: generateId(),
    name,
    description: description || undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    agents,
    connections: virtualConnections,
    layout,
  }

  try {
    await invoke('save_preset', { preset })
    tabComm.showToast('预设保存成功')
    showPresetManager.value = false
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    tabComm.showToast(`保存预设失败: ${msg}`, 'error')
  }
}

async function applyPreset(preset: OrchestrationPreset) {
  // 1. 创建终端标签
  const idMapping: Record<string, number> = {}
  for (const agent of preset.agents) {
    const newTabId = await store.createTab(
      agent.launchConfig.cmd,
      agent.launchConfig.env,
      agent.launchConfig.cwd,
      agent.name,
    )
    idMapping[agent.id] = newTabId
  }

  // 2. 注入角色
  for (const agent of preset.agents) {
    const newTabId = idMapping[agent.id]
    if (agent.role && newTabId !== undefined) {
      tabComm.tabRoles[newTabId] = agent.role
    }
  }

  // 3. 创建画布卡片
  canvasItems.value = preset.agents.map((agent) => {
    const pos = preset.layout[agent.id] || { x: 100, y: 100 }
    return {
      tabId: idMapping[agent.id],
      x: pos.x,
      y: pos.y,
    }
  })

  // 4. 建立权限和连线
  for (const conn of preset.connections) {
    const fromTabId = idMapping[conn.from]
    const toTabId = idMapping[conn.to]
    if (fromTabId && toTabId) {
      await saveConnection(fromTabId, toTabId)
    }
  }

  syncCanvasState()
  showPresetManager.value = false
  tabComm.showToast(`已应用预设 "${preset.name}"，创建了 ${preset.agents.length} 个 Agent`)
}

// ── Snapshot restore ───────────────────────────────────────────────────────

async function restoreFromSnapshot(snapshot: TerminalSnapshot) {
  // 1. Build oldTabId -> newTabId mapping
  const mapping: Record<number, number> = {}
  for (const entry of snapshot.tabs) {
    if (entry.session_id) {
      const matchedTab = store.tabs.find((t) => t.sessionId === entry.session_id)
      if (matchedTab) {
        mapping[entry.tab_id] = matchedTab.id
      }
    }
  }
  for (const entry of snapshot.tabs) {
    if (mapping[entry.tab_id]) continue
    const matchedTab = store.tabs.find((t) => t.title === entry.title)
    if (matchedTab) {
      mapping[entry.tab_id] = matchedTab.id
    }
  }

  if (Object.keys(mapping).length === 0) {
    tabComm.showToast('未找到匹配的终端标签，请先创建终端后再加载快照', 'error')
    return
  }

  // 2. Restore permissions
  for (const entry of snapshot.tabs) {
    const newId = mapping[entry.tab_id]
    if (!newId) continue
    const perm = entry.permission
    const newAllowedTargets = (perm.allowedTargets ?? [])
      .map((oldId) => mapping[oldId])
      .filter((id): id is number => id !== undefined)
    await invoke('set_tab_permission', {
      tabId: newId,
      enabled: perm.enabled,
      allowedTargets: newAllowedTargets,
    }).catch(() => {})
    tabPermissions.value[newId] = { enabled: perm.enabled, allowedTargets: newAllowedTargets }
  }

  // 3. Restore roles
  for (const entry of snapshot.tabs) {
    const newId = mapping[entry.tab_id]
    if (!newId || !entry.role) continue
    tabComm.tabRoles[newId] = entry.role
  }

  // 4. Restore canvas
  if (snapshot.canvas) {
    canvasItems.value = snapshot.canvas.items
      .filter((item) => mapping[item.tabId] !== undefined)
      .map((item) => ({
        tabId: mapping[item.tabId],
        x: item.x,
        y: item.y,
      }))

    connections.value = snapshot.canvas.connections
      .filter((conn) => mapping[conn.from] !== undefined && mapping[conn.to] !== undefined)
      .map((conn) => ({
        from: Math.min(mapping[conn.from], mapping[conn.to]),
        to: Math.max(mapping[conn.from], mapping[conn.to]),
      }))
  }

  // 5. Refresh permissions and connections
  for (const newId of Object.values(mapping)) {
    await fetchTabPermission(newId)
  }
  refreshConnections()
  syncCanvasState()

  tabComm.showToast(`已恢复 ${Object.keys(mapping).length} 个标签的编排`)
}

watch(
  () => tabComm.pendingRestoreSnapshot,
  async (snapshot) => {
    if (!snapshot) return
    await restoreFromSnapshot(snapshot)
    tabComm.clearPendingRestore()
  },
  { immediate: false }
)

// ── Watch permissionSaved signal from TabPermissionModal ───────────────────

watch(
  () => tabComm.permissionSaved,
  async (tabId) => {
    if (tabId !== null) {
      await fetchTabPermission(tabId)
      refreshConnections()
      tabComm.permissionSaved = null
    }
  }
)

// ── Window-level event listeners ───────────────────────────────────────────

let unlistenTitle: (() => void) | null = null

onMounted(async () => {
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
  window.addEventListener('keydown', onKeyDown)

  unlistenTitle = await listen<PtyTitle>('pty_title', (event) => {
    const { tab_id } = event.payload

    // 已经注入过，跳过
    if (injectedTabs.has(tab_id)) return

    // 没有配置角色，跳过
    const role = tabComm.getRole(tab_id)
    if (!role) return

    // 恢复的 session 跳过注入
    const tab = store.tabs.find(t => t.id === tab_id)
    if (tab?.sessionId) return

    // 延迟注入，确保 Claude Code 已就绪
    const timeoutId = setTimeout(() => {
      injectSystemPrompt(tab_id, role)
    }, 800)
    pendingInjections.set(tab_id, timeoutId)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
  window.removeEventListener('keydown', onKeyDown)
  if (unlistenTitle) unlistenTitle()
  pendingInjections.forEach((id) => clearTimeout(id))
  pendingInjections.clear()
})
</script>

<template>
  <div class="orch-manager">
    <!-- Left sidebar — tab list -->
    <div class="orch-manager__sidebar">
      <div class="orch-sidebar__header">终端标签页</div>
      <div class="orch-sidebar__hint">拖拽标签到右侧画布</div>

      <div class="orch-sidebar__tab-list">
        <div
          v-for="tab in store.tabs"
          :key="tab.id"
          class="orch-sidebar__tab"
          :class="{ 'orch-sidebar__tab--on-canvas': isOnCanvas(tab.id) }"
          draggable="true"
          @dragstart="onDragStart(tab.id, $event)"
          @mousedown="onSidebarMouseDown(tab.id, $event)"
        >
          <span
            class="orch-tab__dot"
            :class="tab.active ? 'dot--working' : tab.alive ? 'dot--idle' : 'dot--dead'"
          />
          <span class="orch-tab__title">{{ tab.title }}</span>
          <span v-if="isOnCanvas(tab.id)" class="orch-tab__badge">已编排</span>
        </div>

        <div v-if="store.tabs.length === 0" class="orch-sidebar__empty">
          暂无终端标签页
        </div>
      </div>

      <!-- Snapshot management -->
      <div class="orch-sidebar__snapshot">
        <button class="btn btn-secondary snapshot-btn" @click="tabComm.openSnapshotList()">
          快照管理
        </button>
      </div>

      <!-- Preset management -->
      <div class="orch-sidebar__preset">
        <button class="btn btn-secondary preset-btn" @click="openPresetManager">
          预设管理
        </button>
      </div>
      <div class="orch-sidebar__preset-save">
        <button class="btn btn-secondary preset-save-btn" @click="openCreatePreset">
          保存为预设
        </button>
      </div>
    </div>

    <!-- Right canvas -->
    <div
      ref="canvasRef"
      class="orch-manager__canvas"
      :class="{ 'orch-manager__canvas--drag-over': dragOverCanvas }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <!-- Empty state -->
      <div v-if="canvasItems.length === 0" class="orch-canvas__empty">
        <div class="orch-canvas__empty-icon">🎨</div>
        <div class="orch-canvas__empty-text">
          从左侧拖拽终端标签页到此处<br />
          进行权限编排
        </div>
      </div>

      <!-- SVG connections layer -->
      <svg class="orch-canvas__svg">
        <!-- Permanent connections -->
        <g v-for="conn in connections" :key="`${conn.from}-${conn.to}`">
          <line
            :x1="getCardEdgePoint(conn.from, 'right').x"
            :y1="getCardEdgePoint(conn.from, 'right').y"
            :x2="getCardEdgePoint(conn.to, 'left').x"
            :y2="getCardEdgePoint(conn.to, 'left').y"
            :stroke="selectedConnection?.from === conn.from && selectedConnection?.to === conn.to ? '#FF3B30' : '#007AFF'"
            :stroke-width="selectedConnection?.from === conn.from && selectedConnection?.to === conn.to ? 3 : 2"
            stroke-opacity="0.6"
            stroke-linecap="round"
            pointer-events="stroke"
            style="cursor: pointer"
            @click="selectedConnection = conn"
          />
          <circle
            :cx="getCardEdgePoint(conn.from, 'right').x"
            :cy="getCardEdgePoint(conn.from, 'right').y"
            r="4"
            fill="#007AFF"
            fill-opacity="0.6"
            pointer-events="none"
          />
          <circle
            :cx="getCardEdgePoint(conn.to, 'left').x"
            :cy="getCardEdgePoint(conn.to, 'left').y"
            r="4"
            fill="#007AFF"
            fill-opacity="0.6"
            pointer-events="none"
          />
        </g>

        <!-- Temporary drawing line -->
        <line
          v-if="isDrawingConnection && drawFromTabId !== null"
          :x1="getCardEdgePoint(drawFromTabId, drawFromEdge).x"
          :y1="getCardEdgePoint(drawFromTabId, drawFromEdge).y"
          :x2="drawMousePos.x"
          :y2="drawMousePos.y"
          stroke="#007AFF"
          stroke-width="2"
          stroke-opacity="0.4"
          stroke-dasharray="6 4"
          stroke-linecap="round"
          pointer-events="none"
        />
      </svg>

      <!-- Canvas cards -->
      <div
        v-for="item in canvasItems"
        :key="item.tabId"
        class="orch-canvas__card"
        :class="{ 'orch-canvas__card--moving': isMovingCard && movingCardId === item.tabId }"
        :style="{ left: item.x + 'px', top: item.y + 'px' }"
        @mousedown="onCardMouseDown(item, $event)"
      >
        <!-- Anchor points -->
        <div
          class="orch-card__anchor orch-card__anchor--top"
          @mousedown="onAnchorMouseDown(item.tabId, 'top', $event)"
        />
        <div
          class="orch-card__anchor orch-card__anchor--bottom"
          @mousedown="onAnchorMouseDown(item.tabId, 'bottom', $event)"
        />
        <div
          class="orch-card__anchor orch-card__anchor--left"
          @mousedown="onAnchorMouseDown(item.tabId, 'left', $event)"
        />
        <div
          class="orch-card__anchor orch-card__anchor--right"
          @mousedown="onAnchorMouseDown(item.tabId, 'right', $event)"
        />

        <div class="orch-card__header">
          <span
            class="orch-card__dot"
            :class="
              getTab(item.tabId)?.active
                ? 'dot--working'
                : getTab(item.tabId)?.alive
                  ? 'dot--idle'
                  : 'dot--dead'
            "
          />
          <span class="orch-card__title">{{ getTab(item.tabId)?.title ?? '未知' }}</span>
          <button class="orch-card__close" @click="removeFromCanvas(item.tabId)" title="移除">
            ×
          </button>
        </div>
        <div class="orch-card__body">
          <div class="orch-card__meta">Tab #{{ item.tabId }}</div>
          <div class="orch-card__actions">
            <button class="btn btn-primary orch-card__perm-btn" @click="openPermConfig(item.tabId)">
              权限配置
            </button>
            <button
              class="btn orch-card__role-btn"
              :class="{ 'btn-primary': tabComm.tabRoles[item.tabId], 'btn-secondary': !tabComm.tabRoles[item.tabId] }"
              @click="openRoleConfig(item.tabId)"
            >
              {{ tabComm.tabRoles[item.tabId] ? '角色已配' : '角色配置' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Ghost card (follows mouse during fallback drag) -->
    <div
      v-if="isMouseDragging && mouseDragTabId !== null"
      class="orch-ghost-card"
      :style="{ left: ghostPos.x + 'px', top: ghostPos.y + 'px' }"
    >
      <div class="orch-card__header">
        <span
          class="orch-card__dot"
          :class="
            getTab(mouseDragTabId)?.active
              ? 'dot--working'
              : getTab(mouseDragTabId)?.alive
                ? 'dot--idle'
                : 'dot--dead'
          "
        />
        <span class="orch-card__title">{{ getTab(mouseDragTabId)?.title ?? '未知' }}</span>
      </div>
      <div class="orch-card__body">
        <div class="orch-card__meta">Tab #{{ mouseDragTabId }}</div>
      </div>
    </div>

    <!-- Modals -->
    <TabPermissionModal v-if="tabComm.permModalOpen" />
    <AgentRoleModal v-if="tabComm.roleModalOpen" />
    <SnapshotManager v-if="tabComm.snapshotListOpen" v-model="snapshotPath" />
    <PresetManager
      v-if="showPresetManager"
      :mode="presetManagerMode"
      @save="saveCurrentAsPreset"
      @apply="applyPreset"
      @close="showPresetManager = false"
    />

    <!-- Toast notification -->
    <ToastNotification />
  </div>
</template>

<style scoped>
.orch-manager {
  display: flex;
  flex-direction: row;
  height: 100%;
  overflow: hidden;
}

/* ── Left sidebar ────────────────────────────────────────── */
.orch-manager__sidebar {
  display: flex;
  flex-direction: column;
  width: 200px;
  flex-shrink: 0;
  background: var(--tab-bg);
  border-right: 1px solid var(--separator);
  padding: 12px;
  gap: 8px;
  overflow: hidden;
}

.orch-sidebar__header {
  font-size: var(--font-size-title);
  font-weight: 600;
  color: var(--text-primary);
}

.orch-sidebar__hint {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
}

.orch-sidebar__tab-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.orch-sidebar__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--card);
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  cursor: grab;
  user-select: none;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}

.orch-sidebar__tab:hover {
  background: var(--bg);
  border-color: var(--primary);
}

.orch-sidebar__tab--on-canvas {
  opacity: 0.6;
  border-style: dashed;
}

.orch-tab__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot--working {
  background-color: #ff9500;
}

.dot--idle {
  background-color: #34c759;
}

.dot--dead {
  background-color: #999999;
}

.orch-tab__title {
  font-size: var(--font-size-small);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

 .orch-tab__badge {
  font-size: 10px;
  color: var(--primary);
  background: rgba(0, 122, 255, 0.1);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

[data-theme="dark"] .orch-tab__badge {
  background: rgba(10, 132, 255, 0.2);
}

.orch-sidebar__empty {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
  text-align: center;
  padding: 20px 0;
}

.orch-sidebar__snapshot {
  flex-shrink: 0;
  margin-top: 4px;
}

.snapshot-btn {
  font-size: var(--font-size-small);
  padding: 4px 8px;
  width: 100%;
}

.orch-sidebar__preset {
  flex-shrink: 0;
  margin-top: 4px;
}

.preset-btn {
  font-size: var(--font-size-small);
  padding: 4px 8px;
  width: 100%;
}

.orch-sidebar__preset-save {
  flex-shrink: 0;
  margin-top: 4px;
}

.preset-save-btn {
  font-size: var(--font-size-small);
  padding: 4px 8px;
  width: 100%;
}

/* ── Right canvas ────────────────────────────────────────── */
.orch-manager__canvas {
  flex: 1;
  position: relative;
  background: var(--bg);
  overflow: hidden;
  background-image:
    radial-gradient(circle, var(--separator) 1px, transparent 1px);
  background-size: 20px 20px;
}

.orch-manager__canvas--drag-over {
  background-color: rgba(0, 122, 255, 0.04);
  box-shadow: inset 0 0 0 2px var(--primary);
}

[data-theme="dark"] .orch-manager__canvas--drag-over {
  background-color: rgba(10, 132, 255, 0.08);
}

.orch-canvas__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  pointer-events: none;
}

.orch-canvas__empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.4;
}

.orch-canvas__empty-text {
  font-size: var(--font-size-base);
  text-align: center;
  line-height: 1.6;
}

/* ── Canvas cards ────────────────────────────────────────── */
.orch-canvas__card {
  position: absolute;
  width: 180px;
  background: var(--card);
  border: 1px solid var(--separator);
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  cursor: grab;
}

.orch-card__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--tab-bg);
  border-bottom: 1px solid var(--separator);
}

.orch-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.orch-card__title {
  font-size: var(--font-size-small);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.orch-card__close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: var(--text-secondary);
  padding: 0 2px;
  border-radius: 3px;
  transition: color 0.12s ease;
}

.orch-card__close:hover {
  color: var(--danger);
}

.orch-card__body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.orch-card__meta {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
}

.orch-card__perm-btn {
  font-size: var(--font-size-small);
  padding: 4px 8px;
  flex: 1;
}

.orch-card__role-btn {
  font-size: var(--font-size-small);
  padding: 4px 8px;
  flex: 1;
}

.orch-card__actions {
  display: flex;
  gap: 6px;
}

/* ── Ghost card (fallback drag) ──────────────────────────── */
.orch-ghost-card {
  position: fixed;
  width: 180px;
  background: var(--card);
  border: 1px solid var(--primary);
  border-radius: var(--radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  opacity: 0.85;
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
}

.orch-canvas__card--moving {
  cursor: grabbing;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

/* ── SVG layer ───────────────────────────────────────────── */
.orch-canvas__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.orch-canvas__svg line {
  pointer-events: stroke;
}

/* ── Anchor points ───────────────────────────────────────── */
.orch-card__anchor {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #007aff;
  z-index: 2;
  cursor: crosshair;
  transition: width 0.15s ease, height 0.15s ease, margin 0.15s ease;
}

.orch-card__anchor:hover {
  width: 14px;
  height: 14px;
}

.orch-card__anchor--top {
  top: -5px;
  left: 50%;
  transform: translateX(-50%);
}

.orch-card__anchor--top:hover {
  top: -7px;
}

.orch-card__anchor--bottom {
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
}

.orch-card__anchor--bottom:hover {
  bottom: -7px;
}

.orch-card__anchor--left {
  left: -5px;
  top: 50%;
  transform: translateY(-50%);
}

.orch-card__anchor--left:hover {
  left: -7px;
}

.orch-card__anchor--right {
  right: -5px;
  top: 50%;
  transform: translateY(-50%);
}

.orch-card__anchor--right:hover {
  right: -7px;
}

</style>
