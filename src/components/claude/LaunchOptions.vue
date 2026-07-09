<template>
  <div class="card launch-options">
    <div class="card-title">启动选项</div>

    <!-- Launch directory row -->
    <div class="dir-row">
      <label class="field-label">启动目录</label>
      <div class="dir-input-wrap" @focusout="onHistoryBlur">
        <input
          class="input dir-input"
          type="text"
          :value="store.launchDir"
          readonly
          placeholder="默认使用当前工作目录"
        />
        <button
          class="btn btn-icon dir-history-btn"
          :disabled="store.launchDirHistory.length === 0"
          title="历史目录"
          @click="toggleHistory"
        >&#9660;</button>
        <div class="history-panel" v-if="showHistory && store.launchDirHistory.length > 0">
          <div
            v-for="dir in store.launchDirHistory"
            :key="dir"
            class="history-item"
            :class="{ active: dir === store.launchDir }"
            @mousedown.prevent="onHistoryClick(dir)"
          >{{ dir }}</div>
        </div>
      </div>
      <button class="btn btn-secondary" @click="browseDir">浏览</button>
      <button class="btn btn-danger" @click="clearDir">清空</button>
      <button class="btn btn-secondary" @click="openDir">打开</button>
    </div>

    <!-- Checkboxes -->
    <div class="check-row">
      <label class="check-label">
        <input type="checkbox" v-model="store.awaySummaryDisabled" @change="store.saveSettings()" />
        关闭 away summary
      </label>
      <label class="check-label">
        <input type="checkbox" v-model="store.skipPermissions" @change="store.saveSettings()" />
        跳过权限检查 (--dangerously-skip-permissions)
      </label>
    </div>

    <!-- Launch button row -->
    <div class="launch-row">
      <button
        class="btn btn-success"
        @click="store.launchClaude()"
      >
        {{ store.claudeInstalled ? '启动 Claude Code' : '安装 Claude Code' }}
      </button>
      <label class="check-label">
        <input type="checkbox" v-model="store.useBuiltinTerminal" />
        使用内置终端
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { useClaudeStore } from '@/stores/claude'

const store = useClaudeStore()
const showHistory = ref(false)

function toggleHistory() {
  if (store.launchDirHistory.length > 0) {
    showHistory.value = !showHistory.value
  }
}

function onHistoryClick(dir: string) {
  store.launchDir = dir
  store.saveLaunchDir()
  store.loadSessions()
  showHistory.value = false
}

function onHistoryBlur() {
  // Delay close to allow mousedown on history items to fire first
  setTimeout(() => { showHistory.value = false }, 150)
}

async function browseDir() {
  const selected = await openDialog({ directory: true, title: '选择 Claude Code 启动目录' })
  if (selected && typeof selected === 'string') {
    store.launchDir = selected
    await store.saveLaunchDir()
    await store.loadSessions()
  }
}

function clearDir() {
  store.launchDir = ''
  store.saveLaunchDir()
  store.loadSessions()
}

async function openDir() {
  if (!store.launchDir) {
    store.statusMessage = '启动目录为空，请先设置启动目录'
    return
  }
  try {
    await invoke('open_directory', { path: store.launchDir })
  } catch {
    store.statusMessage = '打开目录失败'
  }
}
</script>

<style scoped>
.launch-options {
  flex-shrink: 0;
}

.dir-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  flex-wrap: wrap;
}

.field-label {
  width: 70px;
  flex-shrink: 0;
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  text-align: right;
}

.dir-input-wrap {
  position: relative;
  flex: 1;
  display: flex;
  min-width: 160px;
}

.dir-input {
  flex: 1;
  min-width: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.dir-history-btn {
  flex-shrink: 0;
  width: 26px;
  padding: 0;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  appearance: none;
  outline: none;
}

.dir-history-btn:hover:not(:disabled) {
  color: var(--primary);
}

.dir-history-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.history-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: var(--card);
  border: 1px solid var(--input-border);
  border-top: none;
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

[data-theme="dark"] .history-panel {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}

.history-item {
  padding: 6px 10px;
  font-size: var(--font-size-small);
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item:hover,
.history-item.active {
  background: #F0F7FF;
  color: var(--primary);
}

[data-theme="dark"] .history-item:hover,
[data-theme="dark"] .history-item.active {
  background: rgba(10, 132, 255, 0.15);
}

.check-row {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 8px 0 4px;
  flex-wrap: wrap;
}

.check-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
}

.launch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 2px;
  justify-content: flex-end;
}
</style>
