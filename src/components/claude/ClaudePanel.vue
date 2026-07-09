<template>
  <div class="claude-panel">
    <Transition name="claude-left-pane">
      <div
        v-if="!props.sidebarCollapsed"
        class="claude-panel__sidebar-shell"
        :style="{ width: `${leftWidth + 9}px`, flexBasis: `${leftWidth + 9}px` }"
      >
        <!-- Left sidebar -->
        <aside class="claude-panel__sidebar" :style="{ width: leftWidth + 'px' }">
          <div class="sidebar__header">
            <button class="btn btn-primary sidebar__new-btn" @click="store.newConfig()">
              新建配置
            </button>
          </div>
          <div class="sidebar__list">
            <ConfigList />
          </div>
          <div class="sidebar__separator">
            <span class="sidebar__separator-label">会话记录</span>
          </div>
          <div class="sidebar__sessions">
            <SessionList />
          </div>
        </aside>

        <!-- Resize divider -->
        <div
          class="claude-panel__divider"
          :class="{ 'claude-panel__divider--dragging': isDragging }"
          @mousedown="onMouseDown"
        />
      </div>
    </Transition>

    <!-- Right content -->
    <main class="claude-panel__content">
      <ConfigEditor />
      <LaunchOptions />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useClaudeStore } from '@/stores/claude'
import { useResizablePanes } from '@/composables/useResizablePanes'
import ConfigList from './ConfigList.vue'
import ConfigEditor from './ConfigEditor.vue'
import LaunchOptions from './LaunchOptions.vue'
import SessionList from './SessionList.vue'

const store = useClaudeStore()
const props = defineProps<{
  sidebarCollapsed?: boolean
}>()
const { leftWidth, isDragging, onMouseDown, loadSizes, saveSizes } = useResizablePanes(280, 200, 400)

const PANE_KEY = 'claude-panel'

onMounted(async () => {
  await loadSizes(PANE_KEY)
  await Promise.all([
    store.loadConfigs(),
    store.loadSettings(),
    store.findClaudeExe(),
    store.loadLaunchDir(),
    store.loadRecentProjects(),
  ])
  await store.loadSessions()
})

// Save pane width when dragging ends — watch isDragging transition to false
watch(isDragging, (val) => {
  if (!val) saveSizes(PANE_KEY)
})
</script>

<style scoped>
.claude-panel {
  display: flex;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg);
}

.claude-panel__sidebar-shell {
  flex: 0 0 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.claude-left-pane-enter-active,
.claude-left-pane-leave-active {
  transition: width 0.22s ease, flex-basis 0.22s ease, opacity 0.16s ease;
}

.claude-left-pane-enter-from,
.claude-left-pane-leave-to {
  width: 0 !important;
  flex-basis: 0 !important;
  opacity: 0;
}

.claude-panel__sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--separator);
  background-color: var(--bg);
  padding: 12px;
  gap: 8px;
  min-width: 0;
}

.sidebar__header {
  flex-shrink: 0;
}

.sidebar__new-btn {
  width: 100%;
}

.sidebar__list {
  flex-shrink: 0;
  overflow-y: auto;
  min-height: 0;
  max-height: 40%;
}

.sidebar__separator {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0 2px;
}

.sidebar__separator-label {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
  white-space: nowrap;
}

.sidebar__separator::after {
  content: '';
  flex: 1;
  height: 1px;
  background-color: var(--separator);
}

.sidebar__sessions {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* Resize divider */
.claude-panel__divider {
  width: 9px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.claude-panel__divider::after {
  content: '';
  width: 1px;
  height: 100%;
  background-color: var(--separator);
  transition: background-color 0.2s ease, width 0.2s ease, box-shadow 0.2s ease;
}

.claude-panel__divider:hover::after,
.claude-panel__divider--dragging::after {
  width: 2px;
  background-color: var(--primary);
}

[data-theme="dark"] .claude-panel__divider:hover::after,
[data-theme="dark"] .claude-panel__divider--dragging::after {
  box-shadow: 0 0 6px 1px rgba(10, 132, 255, 0.5);
}

.claude-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
</style>
