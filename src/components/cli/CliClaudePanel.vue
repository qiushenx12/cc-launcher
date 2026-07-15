<template>
  <ClaudePanel :sidebar-collapsed="sidebarCollapsed" />
</template>

<script setup lang="ts">
import ClaudePanel from '@/components/claude/ClaudePanel.vue'

defineProps<{
  sidebarCollapsed?: boolean
}>()
</script>
