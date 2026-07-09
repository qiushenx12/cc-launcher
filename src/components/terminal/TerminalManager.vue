<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useTerminalStore } from '@/stores/terminal'
import { useDragReorder } from '@/composables/useDragReorder'
import TerminalPane from './TerminalPane.vue'
import TerminalTab from './TerminalTab.vue'
import ToastNotification from '@/components/common/ToastNotification.vue'

const props = defineProps<{
  /** Optional working directory for new terminals */
  launchDir?: string | null
}>()

const store = useTerminalStore()
const visibleTabs = computed(() => store.terminalTabs)

const { draggingIndex, overIndex, justDragged, onPointerDown } = useDragReorder(
  () => visibleTabs.value,
  (newTabs) => store.reorderTerminalTabs(newTabs),
)

// Local font size ref — only synced to store on save
const localFontSize = ref(store.fontSize)

onMounted(async () => {
  await store.loadFontSize()
  localFontSize.value = store.fontSize
})

async function newTerminal() {
  const cwd = props.launchDir ?? null
  await store.createTab(['cmd.exe'], {}, cwd)
}

async function saveFontSize() {
  const parsed = parseInt(String(localFontSize.value), 10)
  if (!isNaN(parsed)) {
    await store.setFontSize(parsed)
    localFontSize.value = store.fontSize
  }
}

function onFontKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') saveFontSize()
}
</script>

<template>
  <div class="terminal-manager">
    <!-- Left sidebar -->
    <div class="terminal-manager__sidebar">
      <button class="btn btn-primary sidebar-new-btn" @click="newTerminal">
        ＋ 新建终端
      </button>

      <!-- Vertical tab list -->
      <div class="terminal-manager__tab-list">
        <div
          v-for="(tab, index) in visibleTabs"
          :key="tab.id"
          data-drag-item
          class="terminal-tab-drag-wrapper"
          :class="{
            'terminal-tab-drag-wrapper--dragging': draggingIndex === index,
            'terminal-tab-drag-wrapper--drag-over': draggingIndex !== null && draggingIndex !== index && overIndex === index,
          }"
        >
          <span
            class="terminal-tab-drag-handle"
            title="拖拽排序"
            @pointerdown="onPointerDown(index, $event)"
          />
          <TerminalTab
            :tab="tab"
            :active="tab.id === store.activeTabId"
            :suppress-click="justDragged"
            @activate="store.activateTab(tab.id)"
            @close="store.closeTab(tab.id)"
            @update-title="(t) => store.updateTabTitle(tab.id, t)"
          />
        </div>
      </div>

      <!-- Font size control at bottom of sidebar -->
      <div class="terminal-manager__font-ctrl">
        <label class="font-ctrl__label">字号</label>
        <input
          class="font-ctrl__input"
          type="number"
          v-model.number="localFontSize"
          min="6"
          max="28"
          @keydown="onFontKeydown"
        />
        <button class="btn btn-success font-ctrl__save" @click="saveFontSize">
          保存
        </button>
      </div>

    </div>

    <!-- Terminal area -->
    <div class="terminal-manager__area">
      <!-- Empty state -->
      <div v-if="visibleTabs.length === 0" class="terminal-manager__empty">
        点击「+ 新建终端」开始
      </div>

      <!-- Terminal panes — use v-show so xterm instances are never destroyed -->
      <TerminalPane
        v-for="tab in visibleTabs"
        :key="tab.id"
        :tab-id="tab.id"
        :active="tab.id === store.activeTabId"
      />
    </div>

    <!-- Modals -->
    <!-- SnapshotManager moved to Orchestration page -->

    <!-- Toast notification -->
    <ToastNotification />
  </div>
</template>

<style scoped>
.terminal-manager {
  display: flex;
  flex-direction: row;
  height: 100%;
  overflow: hidden;
}

/* ── Left sidebar ────────────────────────────────────────── */
.terminal-manager__sidebar {
  display: flex;
  flex-direction: column;
  width: 180px;
  flex-shrink: 0;
  background: var(--tab-bg);
  border-right: 1px solid var(--separator);
  padding: 8px 6px;
  gap: 6px;
  overflow: hidden;
}

.sidebar-new-btn {
  flex-shrink: 0;
  font-size: var(--font-size-small);
  padding: 6px 10px;
  width: 100%;
}

/* ── Vertical tab list ───────────────────────────────────── */
.terminal-manager__tab-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
}

/* ── Drag wrapper & handle ─────────────────────────────── */
.terminal-tab-drag-wrapper {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  position: relative;
  will-change: transform;
}

.terminal-tab-drag-wrapper--dragging {
  opacity: 0.3;
}

.terminal-tab-drag-handle {
  flex-shrink: 0;
  cursor: grab;
  width: 14px;
  height: 14px;
  position: relative;
  opacity: 0;
  transition: opacity 0.12s ease;
  touch-action: none;
  padding: 0 2px;
}

.terminal-tab-drag-handle::before,
.terminal-tab-drag-handle::after {
  content: '';
  position: absolute;
  left: 3px;
  width: 2.5px;
  height: 2.5px;
  border-radius: 50%;
  background-color: var(--text-secondary);
  box-shadow: 5px 0 0 var(--text-secondary), 10px 0 0 var(--text-secondary);
  transition: background-color 0.12s ease, box-shadow 0.12s ease;
}

.terminal-tab-drag-handle::before { top: 1.5px; }
.terminal-tab-drag-handle::after { bottom: 1.5px; }

.terminal-tab-drag-handle:active {
  cursor: grabbing;
}

.terminal-tab-drag-wrapper:hover .terminal-tab-drag-handle {
  opacity: 1;
}

/* ── Font size control ───────────────────────────────────── */
.terminal-manager__font-ctrl {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-right: 12px;
}

.font-ctrl__label {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
  white-space: nowrap;
}

.font-ctrl__input {
  width: 3.5em;
  padding: 3px 6px;
  font-size: var(--font-size-small);
  font-family: var(--font-base);
  color: var(--text-primary);
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: var(--radius-sm);
  outline: none;
  text-align: center;
  /* hide number spinners */
  -moz-appearance: textfield;
}

.font-ctrl__input::-webkit-inner-spin-button,
.font-ctrl__input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}

.font-ctrl__input:focus {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
}

[data-theme="dark"] .font-ctrl__input:focus {
  box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.25);
}

.font-ctrl__save {
  font-size: var(--font-size-small);
  padding: 3px 8px;
}

/* ── Terminal area ───────────────────────────────────────── */
.terminal-manager__area {
  flex: 1;
  position: relative;
  background: #1E1E1E;
  overflow: hidden;
}

.terminal-manager__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 14px;
  font-family: var(--font-base);
  pointer-events: none;
}

</style>

<!-- Non-scoped: override TerminalTab sizing inside drag wrapper -->
<style>
.terminal-tab-drag-wrapper .terminal-tab {
  flex: 1;
  max-width: none;
  min-width: 0;
}
</style>
