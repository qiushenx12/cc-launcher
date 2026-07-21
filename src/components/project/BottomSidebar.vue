<template>
  <aside
    class="bottom-sidebar"
    :style="{ height: `${height}px`, flexBasis: `${height}px` }"
  >
    <header class="bottom-sidebar__tab-bar">
      <div class="bottom-sidebar__tabs" role="tablist" aria-label="独立终端标签页">
        <div
          v-for="tab in store.bottomSidebarTabs"
          :key="tab.id"
          class="bottom-sidebar__tab"
          :class="{ active: tab.id === store.activeBottomSidebarTerminalId }"
          role="tab"
          :aria-selected="tab.id === store.activeBottomSidebarTerminalId"
          tabindex="0"
          @click="store.activateBottomSidebarTerminal(tab.id)"
          @keydown.enter="store.activateBottomSidebarTerminal(tab.id)"
          @keydown.space.prevent="store.activateBottomSidebarTerminal(tab.id)"
        >
          <span
            class="bottom-sidebar__status"
            :class="tab.alive ? 'bottom-sidebar__status--alive' : 'bottom-sidebar__status--dead'"
            aria-hidden="true"
          ></span>
          <span class="bottom-sidebar__tab-title">{{ tab.title }}</span>
          <button
            class="bottom-sidebar__tab-close"
            type="button"
            title="关闭终端"
            aria-label="关闭终端"
            @click.stop="store.closeBottomSidebarTerminal(tab.id)"
          >
            ×
          </button>
        </div>
      </div>

      <div ref="addMenuRef" class="bottom-sidebar__add-wrap">
        <button
          class="bottom-sidebar__add"
          type="button"
          title="新建终端"
          aria-label="新建终端"
          :aria-expanded="addMenuOpen"
          @click="toggleAddMenu"
        >
          +
        </button>
        <div v-if="addMenuOpen" class="bottom-sidebar__add-menu">
          <button type="button" @click="createTerminal('home')">
            <span class="bottom-sidebar__menu-icon" aria-hidden="true">⌂</span>
            <span class="bottom-sidebar__menu-copy">
              <strong>默认路径</strong>
              <small>{{ store.homeDirectory || '用户主目录' }}</small>
            </span>
          </button>
          <div class="bottom-sidebar__menu-separator"></div>
          <div class="bottom-sidebar__menu-label">最近更新的项目</div>
          <button
            v-for="project in store.recentBottomTerminalProjects"
            :key="project.id"
            type="button"
            @click="createProjectTerminal(project.id)"
          >
            <span class="bottom-sidebar__menu-icon" aria-hidden="true">▣</span>
            <span class="bottom-sidebar__menu-copy">
              <strong>{{ project.name }}</strong>
              <small>{{ project.path }}</small>
            </span>
          </button>
          <div
            v-if="store.recentBottomTerminalProjects.length === 0"
            class="bottom-sidebar__menu-empty"
          >
            暂无项目
          </div>
        </div>
      </div>
    </header>

    <section class="bottom-sidebar__terminal-area">
      <TerminalPane
        v-for="tab in store.bottomSidebarTabs"
        :key="tab.id"
        :tab-id="tab.id"
        :active="store.bottomSidebarOpen && tab.id === store.activeBottomSidebarTerminalId"
      />
      <div v-if="store.bottomSidebarTabs.length === 0" class="bottom-sidebar__empty">
        点击“+”新建终端
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useProjectStore, type BottomTerminalLocation } from '@/stores/project'
import TerminalPane from '@/components/terminal/TerminalPane.vue'

defineProps<{
  height: number
}>()

const store = useProjectStore()
const addMenuOpen = ref(false)
const addMenuRef = ref<HTMLElement | null>(null)

function toggleAddMenu() {
  addMenuOpen.value = !addMenuOpen.value
  if (addMenuOpen.value) store.loadHomeDirectory()
}

async function createTerminal(location: BottomTerminalLocation) {
  addMenuOpen.value = false
  await store.createBottomSidebarTerminal(location)
}

async function createProjectTerminal(projectId: string) {
  addMenuOpen.value = false
  await store.createBottomSidebarTerminal('project', projectId)
}

function onDocumentClick(event: MouseEvent) {
  if (!addMenuOpen.value || addMenuRef.value?.contains(event.target as Node)) return
  addMenuOpen.value = false
}

watch(() => store.activeCliKind, () => {
  addMenuOpen.value = false
  if (store.bottomSidebarOpen) store.ensureBottomSidebarTerminal()
})

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<style scoped>
.bottom-sidebar {
  width: 100%;
  flex: 0 0 240px;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--terminal-bg);
}

.bottom-sidebar__tab-bar {
  height: 38px;
  flex: 0 0 38px;
  display: flex;
  align-items: stretch;
  padding: 4px 6px 0;
  background: #252526;
  border-bottom: 1px solid #333;
}

.bottom-sidebar__tabs {
  min-width: 0;
  display: flex;
  align-items: stretch;
  gap: 2px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.bottom-sidebar__tabs::-webkit-scrollbar {
  display: none;
}

.bottom-sidebar__tab {
  width: 168px;
  min-width: 112px;
  max-width: 168px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 6px 0 10px;
  border-radius: 6px 6px 0 0;
  background: #2d2d2d;
  color: #c9c9c9;
  cursor: default;
  outline: none;
  user-select: none;
}

.bottom-sidebar__tab:hover {
  background: #343434;
}

.bottom-sidebar__tab:focus-visible {
  box-shadow: inset 0 0 0 1px #60a5fa;
}

.bottom-sidebar__tab.active {
  background: var(--terminal-bg);
  color: #fff;
}

.bottom-sidebar__status {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
}

.bottom-sidebar__status--alive {
  background: #38c172;
}

.bottom-sidebar__status--dead {
  background: #777;
}

.bottom-sidebar__tab-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-small);
}

.bottom-sidebar__tab-close,
.bottom-sidebar__add {
  border: 0;
  background: transparent;
  color: #c9c9c9;
  cursor: pointer;
}

.bottom-sidebar__tab-close {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 4px;
  font-size: 16px;
  opacity: 0;
}

.bottom-sidebar__tab:hover .bottom-sidebar__tab-close,
.bottom-sidebar__tab.active .bottom-sidebar__tab-close,
.bottom-sidebar__tab-close:focus-visible {
  opacity: 1;
}

.bottom-sidebar__tab-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.bottom-sidebar__add-wrap {
  flex: 0 0 auto;
  position: relative;
  margin-left: 3px;
}

.bottom-sidebar__add {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  font-size: 21px;
  line-height: 1;
}

.bottom-sidebar__add:hover,
.bottom-sidebar__add[aria-expanded="true"] {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.bottom-sidebar__add-menu {
  position: absolute;
  top: 34px;
  left: 0;
  z-index: 40;
  width: 300px;
  padding: 6px;
  border: 1px solid #454545;
  border-radius: 7px;
  background: #2b2b2b;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
}

.bottom-sidebar__add-menu button {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #f0f0f0;
  text-align: left;
  cursor: pointer;
}

.bottom-sidebar__add-menu button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.09);
}

.bottom-sidebar__add-menu button:disabled {
  opacity: 0.42;
  cursor: default;
}

.bottom-sidebar__menu-separator {
  height: 1px;
  margin: 5px 4px;
  background: #454545;
}

.bottom-sidebar__menu-label,
.bottom-sidebar__menu-empty {
  padding: 4px 9px;
  color: #999;
  font-size: 11px;
}

.bottom-sidebar__menu-empty {
  padding-block: 8px;
}

.bottom-sidebar__menu-icon {
  width: 20px;
  flex: 0 0 20px;
  color: #8ab4f8;
  font-size: 17px;
  text-align: center;
}

.bottom-sidebar__menu-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.bottom-sidebar__menu-copy strong,
.bottom-sidebar__menu-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bottom-sidebar__menu-copy strong {
  font-size: var(--font-size-small);
  font-weight: 500;
}

.bottom-sidebar__menu-copy small {
  color: #aaa;
  font-family: var(--font-mono);
  font-size: 11px;
}

.bottom-sidebar__terminal-area {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: var(--terminal-bg);
}

.bottom-sidebar__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #a8a8a8;
  font-size: var(--font-size-small);
}
</style>
