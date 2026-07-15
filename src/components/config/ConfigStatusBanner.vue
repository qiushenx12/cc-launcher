<template>
  <div
    class="config-status"
    :class="`config-status--${tone}`"
    role="status"
    aria-live="polite"
  >
    <span class="config-status__dot" aria-hidden="true"></span>
    <span>{{ message }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  message: string
  tone?: 'info' | 'success' | 'warning' | 'error'
}>(), {
  tone: 'info',
})
</script>

<style scoped>
.config-status {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--card) 88%, var(--primary) 12%);
  font-size: var(--font-size-small);
  line-height: 1.5;
}

.config-status__dot {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--primary);
}

.config-status--success .config-status__dot { background: var(--success); }
.config-status--warning .config-status__dot { background: #ff9500; }
.config-status--error .config-status__dot { background: var(--danger); }

.config-status--error {
  color: var(--danger);
  background: color-mix(in srgb, var(--card) 90%, var(--danger) 10%);
}
</style>
