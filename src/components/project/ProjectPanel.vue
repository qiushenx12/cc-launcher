<template>
  <div class="project-panel">
    <Transition name="left-pane">
      <div
        v-if="!store.leftSidebarCollapsed"
        class="project-panel__left-shell"
        :style="{ width: `${leftWidth + 9}px`, flexBasis: `${leftWidth + 9}px` }"
      >
        <ProjectSidebar
          :width="leftWidth"
          @open-settings="emit('open-settings')"
        />
        <div
          class="project-panel__divider"
          :class="{ 'project-panel__divider--dragging': leftDivider.isDragging.value }"
          @mousedown="leftDivider.start"
        />
      </div>
    </Transition>

    <section class="project-panel__main">
      <ModuleToolbar />
      <div class="project-panel__content">
        <ProjectTerminalArea />
        <Transition name="right-pane">
          <div
            v-if="store.sidebarOpen"
            class="project-panel__right-shell"
            :style="{ width: `${rightWidth + 9}px`, flexBasis: `${rightWidth + 9}px` }"
          >
            <div
              class="project-panel__divider project-panel__divider--right"
              :class="{ 'project-panel__divider--dragging': rightDivider.isDragging.value }"
              @mousedown="rightDivider.start"
            />
            <RightSidebar :width="rightWidth" />
          </div>
        </Transition>
      </div>
    </section>

    <div v-if="store.statusMessage" class="project-panel__toast">
      {{ store.statusMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/project'
import { useResizableDivider } from '@/composables/useResizableDivider'
import ProjectSidebar from './ProjectSidebar.vue'
import ModuleToolbar from './ModuleToolbar.vue'
import ProjectTerminalArea from './ProjectTerminalArea.vue'
import RightSidebar from './RightSidebar.vue'
import type { CliKind } from '@/types/cli'

const store = useProjectStore()
const props = defineProps<{
  cliKind: CliKind
}>()
const emit = defineEmits<{
  (event: 'open-settings'): void
}>()

const LEFT_KEY = 'project-left-sidebar'
const RIGHT_KEY = 'project-right-sidebar'

const MIN_LEFT = 160
const MIN_RIGHT = 200

function clampLeft(value: number) {
  const max = Math.max(MIN_LEFT, window.innerWidth - 400)
  return Math.max(MIN_LEFT, Math.min(max, value))
}

function clampRight(value: number) {
  const max = Math.max(MIN_RIGHT, window.innerWidth - 400)
  return Math.max(MIN_RIGHT, Math.min(max, value))
}

const leftDivider = useResizableDivider(210, {
  min: MIN_LEFT,
  onChange: (value) => {
    leftWidth.value = clampLeft(value)
  },
})

const rightDivider = useResizableDivider(320, {
  min: MIN_RIGHT,
  invert: true,
  onChange: (value) => {
    rightWidth.value = clampRight(value)
  },
})

const leftWidth = leftDivider.value
const rightWidth = rightDivider.value

async function loadWidths() {
  try {
    const savedLeft = await invoke<number | null>('load_pane_width', { key: LEFT_KEY })
    if (savedLeft !== null && savedLeft !== undefined) {
      leftWidth.value = clampLeft(savedLeft)
    }
  } catch {
    // use default
  }
  try {
    const savedRight = await invoke<number | null>('load_pane_width', { key: RIGHT_KEY })
    if (savedRight !== null && savedRight !== undefined) {
      rightWidth.value = clampRight(savedRight)
    }
  } catch {
    // use default
  }
}

async function saveWidth(key: string, value: number) {
  try {
    await invoke('save_pane_width', { key, width: value })
  } catch {
    // ignore
  }
}

watch(leftDivider.isDragging, async (dragging) => {
  if (!dragging) await saveWidth(LEFT_KEY, leftWidth.value)
})

watch(rightDivider.isDragging, async (dragging) => {
  if (!dragging) await saveWidth(RIGHT_KEY, rightWidth.value)
})

onMounted(async () => {
  await loadWidths()
})

watch(() => props.cliKind, (kind) => {
  store.setActiveCliKind(kind)
}, { immediate: true })
</script>

<style scoped>
.project-panel {
  position: relative;
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}

.project-panel__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.project-panel__left-shell,
.project-panel__right-shell {
  flex: 0 0 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.left-pane-enter-active,
.left-pane-leave-active,
.right-pane-enter-active,
.right-pane-leave-active {
  transition: width 0.22s ease, flex-basis 0.22s ease, opacity 0.16s ease;
}

.left-pane-enter-from,
.left-pane-leave-to,
.right-pane-enter-from,
.right-pane-leave-to {
  width: 0 !important;
  flex-basis: 0 !important;
  opacity: 0;
}

.project-panel__content {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

.project-panel__divider {
  width: 9px;
  flex: 0 0 9px;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.project-panel__divider::after {
  content: '';
  width: 1px;
  height: 100%;
  background-color: var(--separator);
  transition: background-color 0.2s ease, width 0.2s ease, box-shadow 0.2s ease;
}

.project-panel__divider:hover::after,
.project-panel__divider--dragging::after {
  width: 2px;
  background-color: var(--primary);
}

[data-theme="dark"] .project-panel__divider:hover::after,
[data-theme="dark"] .project-panel__divider--dragging::after {
  box-shadow: 0 0 6px 1px rgba(10, 132, 255, 0.5);
}

.project-panel__toast {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  max-width: min(480px, calc(100% - 48px));
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(29, 29, 31, 0.92);
  color: #fff;
  font-size: var(--font-size-small);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  z-index: 30;
}
</style>
