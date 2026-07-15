<template>
  <div class="field-row">
    <label class="field-label">{{ label }}</label>
    <div class="model-field">
      <input
        class="input model-field__input"
        type="text"
        :value="modelValue"
        :disabled="disabled"
        :placeholder="placeholder"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <select
        class="select model-field__select"
        :value="modelValue"
        :disabled="disabled || models.length === 0"
        @change="onSelectChange"
      >
        <option value="" disabled>{{ models.length ? '选择模型' : '未获取' }}</option>
        <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  modelValue: string
  models: string[]
  disabled?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  placeholder: '手动输入或从下拉选择',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

function onSelectChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value) emit('update:modelValue', value)
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
  color: var(--text-secondary);
  text-align: right;
  font-size: var(--font-size-base);
}

.model-field {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.model-field__input {
  min-width: 0;
  flex: 1;
}

.model-field__select {
  width: 160px;
  flex-shrink: 0;
}
</style>
