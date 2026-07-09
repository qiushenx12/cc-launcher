<template>
  <main
    ref="terminalRef"
    class="project-terminal"
    :class="{ 'project-terminal--drag-over': dragOver }"
  >
    <div v-if="!store.activeProject" class="project-terminal__empty">
      <button class="btn btn-primary" @click="store.pickAndAddProject">
        选择项目目录
      </button>
    </div>

    <div v-else-if="!store.activeSession" class="project-terminal__empty">
      <button class="btn btn-primary" @click="store.createSession()">
        新建项目会话
      </button>
    </div>

    <template v-else>
      <template v-if="terminalTabIds.length > 0">
        <TerminalPane
          v-for="tabId in terminalTabIds"
          :key="tabId"
          :tab-id="tabId"
          :active="tabId === activeTerminalId"
        />
      </template>
      <div v-if="!activeTerminalId" class="project-terminal__empty">
        <div class="project-terminal__project-name">{{ store.activeProject?.name }}</div>
        <template v-if="isFreshProject">
          <button
            class="btn btn-primary project-terminal__action-btn"
            @click="store.ensureSessionTerminal(store.activeSession!.id)"
          >
            新会话
          </button>
        </template>
        <template v-else>
          <div class="project-terminal__empty-title">
            {{ store.activeSession?.name }} 未开启
          </div>
          <div class="project-terminal__actions">
            <button class="btn btn-secondary project-terminal__action-btn" @click="store.createSession()">
              新会话
            </button>
            <button
              class="btn btn-primary project-terminal__action-btn"
              @click="store.ensureSessionTerminal(store.activeSession!.id)"
            >
              继续对话
            </button>
          </div>
        </template>
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/project'
import { useClaudeStore } from '@/stores/claude'
import { useTerminalStore } from '@/stores/terminal'
import { useTauriDrop, isInside } from '@/composables/useTauriDrop'
import TerminalPane from '@/components/terminal/TerminalPane.vue'

const store = useProjectStore()
const claudeStore = useClaudeStore()
const terminalRef = ref<HTMLElement | null>(null)
const dragOver = ref(false)

const activeTerminalId = computed(() => {
  const sessionId = store.activeSessionId
  return sessionId ? store.sessionTerminalIds[sessionId] : undefined
})

const terminalTabIds = computed(() =>
  Object.values(store.sessionTerminalIds).filter((id): id is number => typeof id === 'number')
)

const isFreshProject = computed(() => {
  const session = store.activeSession
  if (!session || activeTerminalId.value) return false
  return store.sessionsOfActiveProject.every((s) => !s.claudeSessionId)
})

function basename(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

function normalizeSeparators(path: string): string {
  return path.replace(/[\\/]+$/, '').replace(/\//g, '\\')
}

function isUnderProject(path: string, projectPath: string): boolean {
  const normalizedPath = normalizeSeparators(path).toLowerCase()
  const normalizedProject = normalizeSeparators(projectPath).toLowerCase()
  return normalizedPath === normalizedProject
    || normalizedPath.startsWith(normalizedProject + '\\')
}

function relativeToProject(path: string, projectPath: string): string {
  const normalizedPath = normalizeSeparators(path)
  const normalizedProject = normalizeSeparators(projectPath)
  if (normalizedPath.toLowerCase() === normalizedProject.toLowerCase()) return ''
  return normalizedPath.slice(normalizedProject.length + 1)
}

function quotePath(text: string): string {
  const escaped = text.replace(/"/g, '\\"')
  return `"${escaped}"`
}

function formatDroppedPath(path: string): string {
  const project = store.activeProject
  if (!project) {
    return quotePath(path)
  }

  if (!isUnderProject(path, project.path)) {
    return quotePath(path)
  }

  const mode = claudeStore.projectDropPathMode
  const inner = mode === 'filename' ? basename(path) : relativeToProject(path, project.path)
  return quotePath(inner)
}

async function handleDroppedFile(path: string) {
  const tabId = activeTerminalId.value
  if (!tabId) {
    store.statusMessage = '没有可用的项目终端'
    return
  }

  const terminalStore = useTerminalStore()
  const tab = terminalStore.tabs.find((t) => t.id === tabId)
  if (!tab?.alive) {
    store.statusMessage = '当前项目终端未运行'
    return
  }

  const text = formatDroppedPath(path)
  try {
    await invoke('pty_write', { tabId, data: text })
  } catch (e) {
    store.statusMessage = `输入文件路径失败: ${e}`
  }
}

useTauriDrop((paths, position) => {
  dragOver.value = false
  if (!isInside(position, terminalRef.value)) return
  const path = paths[0]
  if (!path) return
  handleDroppedFile(path)
}, {
  onOver: (position) => {
    dragOver.value = isInside(position, terminalRef.value)
  },
  onLeave: () => {
    dragOver.value = false
  },
})
</script>

<style scoped>
.project-terminal {
  flex: 1;
  min-width: 0;
  position: relative;
  background: var(--terminal-bg);
  overflow: hidden;
}

.project-terminal--drag-over::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2px dashed var(--primary);
  pointer-events: none;
  z-index: 20;
}

.project-terminal__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 10px;
  color: var(--text-secondary);
  text-align: center;
}

.project-terminal__project-name {
  max-width: clamp(180px, 36vw, 360px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  font-size: 30px;
  line-height: 1.4;
  color: var(--text-primary);
}

.project-terminal__empty-title {
  max-width: clamp(180px, 36vw, 360px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: var(--font-size-base);
  line-height: 1.4;
  color: var(--text-primary);
}

.project-terminal__actions {
  justify-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.project-terminal__action-btn {
  justify-self: center;
  width: auto;
  min-width: 88px;
  max-width: 128px;
  padding-inline: 12px;
}
</style>
