<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="top-bar-order-modal"
      role="presentation"
      @click.self="emit('close')"
    >
      <section
        class="top-bar-order-modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="top-bar-order-title"
      >
        <header class="top-bar-order-modal__header">
          <div>
            <h2 id="top-bar-order-title">顶栏排序</h2>
            <p>拖动或使用箭头排序；隐藏仅影响顶栏，配置页面中的三个 CLI 入口始终保留。</p>
          </div>
          <button
            type="button"
            class="top-bar-order-modal__close"
            title="关闭"
            aria-label="关闭顶栏排序"
            @click="emit('close')"
          >
            ×
          </button>
        </header>

        <div class="top-bar-order-modal__list">
          <div
            v-for="(item, index) in draftOrder"
            :key="item"
            data-drag-item
            class="top-bar-order-modal__item"
            :class="{
              'top-bar-order-modal__item--dragging': draggingIndex === index,
              'top-bar-order-modal__item--over': draggingIndex !== null && overIndex === index,
              'top-bar-order-modal__item--hidden': isHidden(item),
            }"
          >
            <button
              type="button"
              class="top-bar-order-modal__drag-handle"
              title="拖动排序"
              aria-label="拖动排序"
              @pointerdown="onPointerDown(index, $event)"
            >
              <span></span><span></span><span></span>
              <span></span><span></span><span></span>
            </button>
            <span class="top-bar-order-modal__position">{{ index + 1 }}</span>
            <span class="top-bar-order-modal__label">{{ topBarItemLabel(item) }}</span>
            <button
              type="button"
              class="top-bar-order-modal__visibility"
              :class="{ active: isHidden(item) }"
              :disabled="item === 'config'"
              :title="item === 'config' ? '配置入口始终显示' : isHidden(item) ? '在顶栏显示' : '从顶栏隐藏'"
              @click="toggleHidden(item)"
            >
              {{ item === 'config' ? '固定显示' : isHidden(item) ? '显示' : '隐藏' }}
            </button>
            <div class="top-bar-order-modal__move-actions">
              <button
                type="button"
                title="上移"
                aria-label="上移"
                :disabled="index === 0"
                @click="moveItem(index, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                title="下移"
                aria-label="下移"
                :disabled="index === draftOrder.length - 1"
                @click="moveItem(index, 1)"
              >
                ↓
              </button>
            </div>
          </div>
        </div>

        <p v-if="errorMessage" class="top-bar-order-modal__error">{{ errorMessage }}</p>

        <footer class="top-bar-order-modal__footer">
          <button type="button" class="btn btn-secondary" @click="resetOrder">恢复默认</button>
          <div class="top-bar-order-modal__footer-main">
            <button type="button" class="btn btn-secondary" @click="emit('close')">取消</button>
            <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDragReorder } from '@/composables/useDragReorder'
import {
  DEFAULT_TOP_BAR_ORDER,
  topBarItemLabel,
  useTopBarStore,
  type TopBarItem,
} from '@/stores/topBar'
import type { CliKind } from '@/types/cli'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const store = useTopBarStore()
const draftOrder = ref<TopBarItem[]>([...store.order])
const draftHidden = ref<CliKind[]>([...store.hidden])
const saving = ref(false)
const errorMessage = ref('')

const { draggingIndex, overIndex, onPointerDown } = useDragReorder(
  () => draftOrder.value,
  (items) => {
    draftOrder.value = items
  },
)

function moveItem(index: number, offset: -1 | 1) {
  const target = index + offset
  if (target < 0 || target >= draftOrder.value.length) return
  const next = [...draftOrder.value]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  draftOrder.value = next
}

function resetOrder() {
  draftOrder.value = [...DEFAULT_TOP_BAR_ORDER]
  draftHidden.value = []
  errorMessage.value = ''
}

function isHidden(item: TopBarItem) {
  return item !== 'config' && draftHidden.value.includes(item)
}

function toggleHidden(item: TopBarItem) {
  if (item === 'config') return
  draftHidden.value = draftHidden.value.includes(item)
    ? draftHidden.value.filter((kind) => kind !== item)
    : [...draftHidden.value, item]
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    await store.saveLayout(draftOrder.value, draftHidden.value)
    emit('close')
  } catch (error) {
    errorMessage.value = `保存失败：${error}`
  } finally {
    saving.value = false
  }
}

watch(() => props.visible, (visible) => {
  if (!visible) return
  draftOrder.value = [...store.order]
  draftHidden.value = [...store.hidden]
  errorMessage.value = ''
})
</script>

<style scoped>
.top-bar-order-modal {
  position: fixed;
  inset: 0;
  z-index: 1400;
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(2px);
}

.top-bar-order-modal__card {
  width: min(440px, 100%);
  padding: 18px;
  border: 1px solid var(--separator);
  border-radius: 12px;
  background: var(--bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.top-bar-order-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.top-bar-order-modal__header h2 {
  margin: 0 0 4px;
  font-size: 17px;
}

.top-bar-order-modal__header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}

.top-bar-order-modal__close {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--tab-bg);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 20px;
}

.top-bar-order-modal__close:hover {
  color: var(--text-primary);
}

.top-bar-order-modal__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.top-bar-order-modal__item {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  background: var(--card);
  will-change: transform;
}

.top-bar-order-modal__item--dragging {
  opacity: 0.3;
}

.top-bar-order-modal__item--over {
  border-color: var(--primary);
}

.top-bar-order-modal__item--hidden .top-bar-order-modal__label,
.top-bar-order-modal__item--hidden .top-bar-order-modal__position {
  opacity: 0.5;
}

.top-bar-order-modal__drag-handle {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: grid;
  grid-template-columns: repeat(2, 3px);
  grid-auto-rows: 3px;
  place-content: center;
  gap: 3px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  cursor: grab;
  touch-action: none;
}

.top-bar-order-modal__drag-handle:hover {
  background: var(--tab-bg);
}

.top-bar-order-modal__drag-handle:active {
  cursor: grabbing;
}

.top-bar-order-modal__drag-handle span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-secondary);
}

.top-bar-order-modal__position {
  width: 20px;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  text-align: center;
}

.top-bar-order-modal__label {
  min-width: 0;
  flex: 1;
  font-weight: 600;
}

.top-bar-order-modal__visibility {
  min-width: 58px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-small);
}

.top-bar-order-modal__visibility:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--tab-bg);
}

.top-bar-order-modal__visibility.active {
  color: var(--primary);
  border-color: var(--primary);
}

.top-bar-order-modal__visibility:disabled {
  opacity: 0.55;
  cursor: default;
}

.top-bar-order-modal__move-actions {
  display: flex;
  gap: 4px;
}

.top-bar-order-modal__move-actions button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text-primary);
  cursor: pointer;
}

.top-bar-order-modal__move-actions button:hover:not(:disabled) {
  background: var(--tab-bg);
}

.top-bar-order-modal__move-actions button:disabled {
  opacity: 0.35;
  cursor: default;
}

.top-bar-order-modal__error {
  margin: 10px 0 0;
  color: var(--danger);
  font-size: var(--font-size-small);
}

.top-bar-order-modal__footer {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.top-bar-order-modal__footer-main {
  display: flex;
  gap: 8px;
}
</style>
