<template>
  <header class="module-toolbar">
    <div class="module-toolbar__title">
      {{ store.activeSession?.name ?? '未选择会话' }}
    </div>
    <button
      class="module-toolbar__sidebar"
      :class="{ active: store.sidebarOpen }"
      title="展开/收起右侧边栏"
      aria-label="展开/收起右侧边栏"
      @click="toggleSidebar"
    >
      <span class="sidebar-toggle-icon sidebar-toggle-icon--right" aria-hidden="true"></span>
    </button>
  </header>
</template>

<script setup lang="ts">
import { useProjectStore } from '@/stores/project'

const store = useProjectStore()

function toggleSidebar() {
  if (store.sidebarOpen) {
    store.closeSidebar()
  } else {
    store.openSidebar('tools')
  }
}
</script>

<style scoped>
.module-toolbar {
  height: 38px;
  flex: 0 0 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  border-bottom: 1px solid var(--separator);
  background: var(--card);
}

.module-toolbar__title {
  min-width: 0;
  max-width: min(460px, calc(100% - 44px));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-weight: 600;
}

.module-toolbar__sidebar {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--text-secondary);
  cursor: pointer;
}

.module-toolbar__sidebar.active {
  color: var(--primary);
  background: rgba(0, 122, 255, 0.08);
}
</style>
