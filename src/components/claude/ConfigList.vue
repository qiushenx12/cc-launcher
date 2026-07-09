<template>
  <div class="config-list">
    <div
      v-for="(name, index) in store.configOrder"
      :key="name"
      data-drag-item
      class="config-list__item"
      :class="{
        'config-list__item--active': store.activeConfigName === name,
        'config-list__item--dragging': draggingIndex === index,
        'config-list__item--drag-over': draggingIndex !== null && draggingIndex !== index && overIndex === index,
      }"
      @click="onItemClick(name)"
    >
      <span
        class="config-list__drag-handle"
        title="拖拽排序"
        @pointerdown="onPointerDown(index, $event)"
      />
      <span class="config-list__name">{{ name }}</span>
      <button
        class="btn btn-danger config-list__delete"
        title="删除配置"
        @click.stop="confirmDelete(name)"
      >
        删除
      </button>
    </div>
    <div v-if="store.configOrder.length === 0" class="config-list__empty">
      暂无配置
    </div>
  </div>
</template>

<script setup lang="ts">
import { useClaudeStore } from '@/stores/claude'
import { useDragReorder } from '@/composables/useDragReorder'

const store = useClaudeStore()

const { draggingIndex, overIndex, justDragged, onPointerDown } = useDragReorder(
  () => store.configOrder,
  (newOrder: string[]) => store.reorderConfigs(newOrder),
)

function onItemClick(name: string) {
  if (justDragged.value) return
  store.selectConfig(name)
}

function confirmDelete(name: string) {
  if (window.confirm(`确定要删除配置 "${name}" 吗？`)) {
    store.deleteConfig(name)
  }
}
</script>

<style scoped>
.config-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.config-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.12s ease, transform 0.18s ease;
  user-select: none;
  gap: 6px;
  /* Ensure items stack correctly during drag */
  position: relative;
  will-change: transform;
}

.config-list__item:not(.config-list__item--active):hover {
  background-color: rgba(0, 122, 255, 0.08);
}

[data-theme="dark"] .config-list__item:not(.config-list__item--active):hover {
  background-color: rgba(10, 132, 255, 0.15);
}

.config-list__item--active:hover {
  background-color: var(--primary-hover, color-mix(in srgb, var(--primary) 85%, black));
}

.config-list__item--active {
  background-color: var(--primary);
  color: #ffffff;
}

.config-list__item--active .config-list__name {
  color: #ffffff;
}

/* The original item while its clone is being dragged */
.config-list__item--dragging {
  opacity: 0.3;
  background-color: rgba(0, 122, 255, 0.08);
}

[data-theme="dark"] .config-list__item--dragging {
  background-color: rgba(10, 132, 255, 0.15);
}

.config-list__drag-handle {
  flex-shrink: 0;
  cursor: grab;
  width: 14px;
  height: 14px;
  position: relative;
  opacity: 0;
  transition: opacity 0.12s ease;
  touch-action: none;
}

.config-list__drag-handle::before,
.config-list__drag-handle::after {
  content: '';
  position: absolute;
  left: 1px;
  width: 2.5px;
  height: 2.5px;
  border-radius: 50%;
  background-color: var(--text-secondary);
  box-shadow: 5px 0 0 var(--text-secondary), 10px 0 0 var(--text-secondary);
  transition: background-color 0.12s ease, box-shadow 0.12s ease;
}

.config-list__drag-handle::before { top: 1.5px; }
.config-list__drag-handle::after { bottom: 1.5px; }

.config-list__drag-handle:active {
  cursor: grabbing;
}

.config-list__item:hover .config-list__drag-handle {
  opacity: 1;
}

.config-list__item--active .config-list__drag-handle {
  color: rgba(255, 255, 255, 0.7);
}

.config-list__name {
  flex: 1;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.config-list__delete {
  flex-shrink: 0;
  padding: 2px 8px;
  font-size: var(--font-size-small);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.config-list__item:hover .config-list__delete {
  opacity: 1;
}

.config-list__item--active .config-list__delete {
  background-color: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.4);
  opacity: 0;
}

.config-list__item--active:hover .config-list__delete {
  opacity: 1;
}

.config-list__empty {
  padding: 16px 10px;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  text-align: center;
}
</style>
