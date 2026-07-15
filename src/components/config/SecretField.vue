<template>
  <div class="field-row">
    <label class="field-label">{{ label }}</label>
    <div class="secret-field">
      <input
        class="input secret-field__input"
        :type="visible ? 'text' : 'password'"
        :value="modelValue"
        :placeholder="placeholder"
        autocomplete="off"
        spellcheck="false"
        :aria-label="label"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="btn btn-secondary secret-field__toggle"
        :aria-label="visible ? `隐藏${label}` : `显示${label}`"
        @click="visible = !visible"
      >
        {{ visible ? '隐藏' : '显示' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  label: string
  modelValue: string
  placeholder?: string
}>(), {
  placeholder: '',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
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

.secret-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.secret-field__input {
  flex: 1;
  min-width: 0;
}

.secret-field__toggle {
  flex-shrink: 0;
  padding: 5px 10px;
  font-size: var(--font-size-small);
}
</style>
