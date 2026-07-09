<script setup lang="ts">
import { useTabCommStore } from '@/stores/tabComm'
const tabComm = useTabCommStore()
</script>

<template>
  <div v-if="tabComm.toastMessage"
       class="toast"
       :class="'toast--' + tabComm.toastType">
    {{ tabComm.toastMessage }}
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-base);
  font-family: var(--font-base);
  z-index: 2000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: toast-in 0.2s ease;
}

.toast--success {
  background: var(--success);
  color: #ffffff;
}

.toast--error {
  background: var(--danger);
  color: #ffffff;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
