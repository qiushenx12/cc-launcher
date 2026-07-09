<script setup lang="ts">
import { ref } from 'vue'
import type { TerminalTab } from '@/types/terminal'

const props = defineProps<{
  tab: TerminalTab
  active: boolean
  suppressClick?: boolean
}>()

const emit = defineEmits<{
  activate: []
  close: []
  updateTitle: [title: string]
}>()

const editing = ref(false)
const editValue = ref('')

function startEdit() {
  editValue.value = props.tab.title
  editing.value = true
}

function commitEdit() {
  const trimmed = editValue.value.trim()
  if (trimmed) {
    emit('updateTitle', trimmed)
  }
  editing.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    commitEdit()
  } else if (e.key === 'Escape') {
    editing.value = false
  }
}

function tryActivate() {
  if (props.suppressClick) return
  emit('activate')
}
</script>

<template>
  <div
    class="terminal-tab"
    :class="{ active }"
    @click.self="tryActivate()"
  >
    <!-- Status dot -->
    <span
      class="terminal-tab__dot"
      :class="tab.active ? 'dot--working' : (tab.alive ? 'dot--idle' : 'dot--dead')"
      @click="tryActivate()"
    />

    <!-- Editable title -->
    <input
      v-if="editing"
      v-model="editValue"
      class="terminal-tab__title-input"
      @blur="commitEdit"
      @keydown="onKeydown"
      v-focus
    />
    <span
      v-else
      class="terminal-tab__title"
      @click="tryActivate()"
      @dblclick.stop="startEdit"
    >{{ tab.title }}</span>

    <!-- Close button -->
    <button
      class="terminal-tab__close"
      @click.stop="emit('close')"
      title="关闭"
    >×</button>
  </div>
</template>

<!-- Custom directive to auto-focus the input when it appears -->
<script lang="ts">
import { type Directive } from 'vue'
export const vFocus: Directive = {
  mounted(el: HTMLElement) {
    el.focus()
  },
}
</script>

<style scoped>
.terminal-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 12px 8px 12px 10px;
  background: var(--tab-bg);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  border: 1px solid var(--separator);
  max-width: 180px;
  flex-shrink: 0;
  transition: background-color 0.12s ease;
}

.terminal-tab.active {
  background: #007AFF;
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}

.terminal-tab.active .terminal-tab__title {
  color: #ffffff;
}

.terminal-tab.active .terminal-tab__close {
  color: rgba(255, 255, 255, 0.7);
}

.terminal-tab.active .terminal-tab__close:hover {
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.15);
}

.terminal-tab__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot--working {
  background-color: #FF9500;
}

.dot--idle {
  background-color: #34C759;
}

.dot--dead {
  background-color: #999999;
}

.terminal-tab__title {
  font-size: var(--font-size-small);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.terminal-tab__title-input {
  font-size: var(--font-size-small);
  font-family: var(--font-base);
  color: var(--text-primary);
  background: transparent;
  border: none;
  outline: 1px solid var(--input-focus-border);
  border-radius: 2px;
  padding: 0 2px;
  width: 100px;
  flex: 1;
  min-width: 0;
}

.terminal-tab__close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: var(--text-secondary);
  padding: 0 2px;
  border-radius: 3px;
  transition: color 0.12s ease, background-color 0.12s ease;
}

.terminal-tab__close:hover {
  color: var(--danger);
  background-color: rgba(255, 59, 48, 0.1);
}
</style>
