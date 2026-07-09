<template>
  <div class="status-bar">
    <template v-for="(item, index) in items" :key="item.label">
      <div v-if="index > 0" class="status-bar__divider" aria-hidden="true" />
      <div class="status-bar__item">
        <span class="status-bar__label">{{ item.label }}:</span>
        <span class="status-bar__value" :title="item.value">{{ item.value }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
export interface StatusItem {
  label: string
  value: string
}

defineProps<{
  items: StatusItem[]
}>()
</script>
