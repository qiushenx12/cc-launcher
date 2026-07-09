<template>
  <div class="card section-card">
    <div v-if="title" class="card-title section-card__title">{{ title }}</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<style scoped>
.section-card {
  margin-bottom: 12px;
}

.section-card__title {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--separator);
  margin-bottom: 12px;
}
</style>
