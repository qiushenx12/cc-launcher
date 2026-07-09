<template>
  <div class="field-row">
    <label class="field-label">{{ label }}</label>
    <div class="token-field">
      <input
        class="input token-field__input"
        :type="visible ? 'text' : 'password'"
        :value="modelValue"
        autocomplete="off"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="btn btn-secondary token-field__toggle"
        @click="visible = !visible"
      >
        {{ visible ? '隐藏' : '显示' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  label: string
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const visible = ref(false)
</script>

<style scoped>
.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
}

.field-label {
  width: 110px;
  flex-shrink: 0;
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  text-align: right;
}

.token-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.token-field__input {
  flex: 1;
  min-width: 0;
}

.token-field__toggle {
  flex-shrink: 0;
  padding: 5px 10px;
  font-size: var(--font-size-small);
}
</style>
