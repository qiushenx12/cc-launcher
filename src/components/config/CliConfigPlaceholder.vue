<template>
  <div class="config-placeholder">
    <section class="card config-placeholder__card">
      <div class="config-placeholder__eyebrow">{{ descriptor.configFormat.toUpperCase() }} 专属配置</div>
      <h2>{{ descriptor.label }} 配置表单将在{{ stage }}接入</h2>
      <p>{{ description }}</p>
      <ul>
        <li v-for="item in boundaries" :key="item">{{ item }}</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CLI_DESCRIPTORS, type CliKind } from '@/types/cli'

const props = defineProps<{
  kind: Extract<CliKind, 'codex' | 'opencode'>
}>()

const descriptor = computed(() => CLI_DESCRIPTORS[props.kind])
const stage = computed(() => props.kind === 'codex' ? '阶段 D' : '阶段 E')
const description = computed(() => props.kind === 'codex'
  ? '本阶段只建立独立页面、状态和方案边界，不会用 Claude Code 环境变量伪装 Codex TOML 配置。'
  : '本阶段只建立独立页面、状态和方案边界，不会改写 OpenCode 的全局 JSONC 或 auth.json。')
const boundaries = computed(() => props.kind === 'codex'
  ? [
      '配置来源：~/.codex/config.toml 与 auth.json 分离处理',
      '官方登录和自定义提供商将使用不同保存流程',
      '当前页不会写入任何 Codex 文件',
    ]
  : [
      '默认使用启动器受管 JSONC，不覆盖全局配置',
      '既有登录只读检测，不解析或改写 auth.json',
      '当前页不会写入任何 OpenCode 文件',
    ])
</script>

<style scoped>
.config-placeholder {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
}

.config-placeholder__card {
  max-width: 760px;
  margin: 0 auto;
}

.config-placeholder__eyebrow {
  margin-bottom: 8px;
  color: var(--primary);
  font-size: var(--font-size-small);
  font-weight: 600;
}

h2 {
  margin-bottom: 10px;
  font-size: 18px;
}

p,
li {
  color: var(--text-secondary);
  line-height: 1.65;
}

ul {
  margin: 14px 0 0 20px;
}
</style>
