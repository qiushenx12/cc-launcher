<template>
  <div class="field-row">
    <label class="field-label">{{ label }}</label>
    <div class="secret-field">
      <input
        class="input secret-field__input"
        :type="inputType"
        :value="displayValue"
        :placeholder="placeholder"
        :readonly="showingStoredMask"
        autocomplete="off"
        spellcheck="false"
        :aria-label="label"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="btn btn-secondary secret-field__toggle"
        :aria-label="buttonLabel"
        :disabled="loadingStoredValue"
        @click="toggleVisibility"
      >
        {{ buttonLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  modelValue: string
  placeholder?: string
  hasStoredValue?: boolean
  storedValueRevealed?: boolean
  loadingStoredValue?: boolean
}>(), {
  placeholder: '',
  hasStoredValue: false,
  storedValueRevealed: false,
  loadingStoredValue: false,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'revealStoredValue'): void
}>()

const visible = ref(false)
const showingStoredMask = computed(() =>
  props.hasStoredValue && !props.storedValueRevealed && !props.modelValue,
)
const displayValue = computed(() => showingStoredMask.value ? '********' : props.modelValue)
const inputType = computed(() => showingStoredMask.value || visible.value ? 'text' : 'password')
const buttonLabel = computed(() => {
  if (props.loadingStoredValue) return '读取中…'
  if (showingStoredMask.value) return '显示'
  return visible.value ? '隐藏' : '显示'
})

watch(
  () => [props.hasStoredValue, props.storedValueRevealed, props.modelValue] as const,
  ([hasStoredValue, storedValueRevealed, modelValue]) => {
    if ((!hasStoredValue || !storedValueRevealed) && !modelValue) visible.value = false
  },
)

function toggleVisibility() {
  if (showingStoredMask.value) {
    visible.value = true
    emit('revealStoredValue')
    return
  }
  visible.value = !visible.value
}
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
