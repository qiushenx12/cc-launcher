<template>
  <div class="field-row">
    <label class="field-label">{{ label }}</label>
    <div class="model-field">
      <input
        class="input model-field__input"
        type="text"
        :value="modelValue"
        :disabled="disabled"
        placeholder="手动输入或从下拉选择"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <select
        class="select model-field__select"
        :value="modelValue"
        :disabled="disabled || models.length === 0"
        @change="onSelectChange"
      >
        <option value="" disabled>{{ models.length ? '选择模型' : '未获取' }}</option>
        <option v-for="m in models" :key="m" :value="m">{{ m }}</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string
  models: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function onSelectChange(event: Event) {
  const val = (event.target as HTMLSelectElement).value
  if (val) emit('update:modelValue', val)
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

.model-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.model-field__input {
  flex: 1;
  min-width: 0;
}

.model-field__select {
  width: 160px;
  flex-shrink: 0;
}
</style>
