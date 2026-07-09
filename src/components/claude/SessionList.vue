<template>
  <div class="card session-list">
    <div class="card-title">最近会话</div>

    <div v-if="store.visibleSessions.length === 0" class="session-list__empty">
      {{ store.launchDir ? '该目录暂无会话记录' : '请先设置启动目录' }}
    </div>

    <div
      v-for="session in store.visibleSessions"
      :key="session.id"
      class="session-item"
      :title="session.display"
      @click="store.launchClaude(session.id)"
    >
      <span class="session-item__text">{{ truncate(session.display) }}</span>
      <span class="session-item__ts">{{ formatTs(session.ts) }}</span>
    </div>

    <button
      v-if="store.hasMoreSessions"
      class="btn btn-secondary session-list__more"
      @click="store.loadMoreSessions()"
    >
      加载更多
    </button>
  </div>
</template>

<script setup lang="ts">
import { useClaudeStore } from '@/stores/claude'

const store = useClaudeStore()

function truncate(text: string, max = 40): string {
  if (!text) return ''
  const single = text.replace(/\n/g, ' ').replace(/\r/g, '')
  return single.length > max ? single.slice(0, max) + '…' : single
}

function formatTs(ts: number): string {
  if (!ts) return ''
  // Claude history.jsonl may store timestamps in seconds or milliseconds.
  const ms = ts > 1_000_000_000_000 ? ts : ts * 1000
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.session-list {
  flex-shrink: 0;
}

.session-list__empty {
  padding: 12px 0;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  text-align: center;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.12s ease;
  gap: 8px;
}

.session-item:hover {
  background-color: rgba(0, 122, 255, 0.08);
}

[data-theme="dark"] .session-item:hover {
  background-color: rgba(10, 132, 255, 0.15);
}

.session-item__text {
  flex: 1;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.session-item__ts {
  flex-shrink: 0;
  font-size: var(--font-size-small);
  color: var(--text-secondary);
}

.session-list__more {
  margin-top: 8px;
  width: 100%;
}
</style>
