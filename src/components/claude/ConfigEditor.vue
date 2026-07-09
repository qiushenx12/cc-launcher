<template>
  <div class="card config-editor">
    <div class="card-title">配置编辑</div>

    <!-- Config name -->
    <div class="field-row">
      <label class="field-label">配置名称</label>
      <input
        class="input"
        type="text"
        v-model="store.editingConfig.name"
        placeholder="输入配置名称"
      />
    </div>

    <hr class="separator" style="margin: 10px 0;" />

    <!-- ANTHROPIC_BASE_URL -->
    <div class="field-row">
      <label class="field-label">API 地址</label>
      <div class="field-inline">
        <input
          class="input"
          type="text"
          v-model="vars.ANTHROPIC_BASE_URL"
          placeholder="https://api.anthropic.com"
        />
        <button
          class="btn btn-secondary"
          :disabled="store.modelsFetching"
          @click="store.fetchModels()"
        >
          {{ store.modelsFetching ? '获取中…' : '获取模型' }}
        </button>
      </div>
    </div>

    <!-- ANTHROPIC_AUTH_TOKEN -->
    <TokenField
      label="认证令牌"
      v-model="vars.ANTHROPIC_AUTH_TOKEN"
    />

    <!-- Model fields -->
    <ModelField
      label="默认模型"
      v-model="vars.ANTHROPIC_MODEL"
      :models="store.availableModels"
    />
    <ModelField
      label="Opus 模型"
      v-model="vars.ANTHROPIC_DEFAULT_OPUS_MODEL"
      :models="store.availableModels"
    />
    <ModelField
      label="Sonnet 模型"
      v-model="vars.ANTHROPIC_DEFAULT_SONNET_MODEL"
      :models="store.availableModels"
    />
    <ModelField
      label="Haiku 模型"
      v-model="vars.ANTHROPIC_DEFAULT_HAIKU_MODEL"
      :models="store.availableModels"
    />
    <ModelField
      label="子代理模型"
      v-model="vars.CLAUDE_CODE_SUBAGENT_MODEL"
      :models="store.availableModels"
    />

    <!-- CLAUDE_CODE_EFFORT_LEVEL -->
    <div class="field-row">
      <label class="field-label">推理等级</label>
      <div class="field-inline">
        <input
          class="input"
          type="text"
          v-model="vars.CLAUDE_CODE_EFFORT_LEVEL"
          placeholder="low / medium / high / xhigh / max / auto"
        />
        <select
          class="select effort-select"
          @change="onEffortSelect"
        >
          <option value="" disabled selected>选择</option>
          <option v-for="opt in effortOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </div>
    </div>

    <!-- DISABLE_AUTOUPDATER -->
    <div class="field-row">
      <label class="field-label">禁用自动更新</label>
      <input
        class="input"
        type="text"
        v-model="vars.DISABLE_AUTOUPDATER"
        placeholder="1"
      />
    </div>

    <!-- CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS -->
    <div class="field-row">
      <label class="field-label">Agent Teams</label>
      <input
        class="input"
        type="text"
        v-model="vars.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"
        placeholder="1"
      />
    </div>

    <hr class="separator" style="margin: 12px 0 10px;" />

    <!-- Scope radio -->
    <div class="scope-row">
      <span class="scope-label">应用范围</span>
      <label class="radio-label">
        <input type="radio" v-model="store.scope" value="user" />
        当前用户
      </label>
      <label class="radio-label">
        <input type="radio" v-model="store.scope" value="system" />
        系统（所有用户）
      </label>
      <span class="scope-hint">修改系统变量需要管理员权限</span>
    </div>

    <!-- Action buttons -->
    <div class="action-row">
      <button class="btn btn-primary" @click="store.saveConfig()">保存配置</button>
      <button class="btn btn-primary" @click="store.applyToRegistry()">应用到环境变量</button>
    </div>
    <div class="action-row action-row--tools">
      <button class="btn btn-secondary" @click="openJsonDir()">打开JSON目录</button>
      <button class="btn btn-secondary" @click="openEnvVars()">打开环境变量</button>
      <button class="btn btn-secondary" @click="openClaudePath()">打开ClaudeCode路径</button>
    </div>

    <!-- Status hint -->
    <div v-if="store.statusMessage" class="status-hint">{{ store.statusMessage }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useClaudeStore } from '@/stores/claude'
import TokenField from './TokenField.vue'
import ModelField from './ModelField.vue'

const store = useClaudeStore()

// Convenience proxy so templates can use vars.ANTHROPIC_MODEL etc.
const vars = computed(() => store.editingConfig.vars)

const effortOptions = ['low', 'medium', 'high', 'xhigh', 'max', 'auto']

function onEffortSelect(event: Event) {
  const val = (event.target as HTMLSelectElement).value
  if (val) store.editingConfig.vars['CLAUDE_CODE_EFFORT_LEVEL'] = val
  // reset select back to placeholder
  ;(event.target as HTMLSelectElement).value = ''
}

async function openJsonDir() {
  try {
    const path = await invoke<string>('get_claude_config_dir')
    await invoke('open_directory', { path })
  } catch {
    store.statusMessage = '打开JSON目录失败'
  }
}

async function openEnvVars() {
  try {
    await invoke('open_env_vars_dialog')
  } catch {
    store.statusMessage = '打开环境变量失败'
  }
}

async function openClaudePath() {
  try {
    const exePath = store.claudeExePath
    if (!exePath) {
      store.statusMessage = 'Claude Code 未安装'
      return
    }
    // Derive directory from exe path
    const dir = exePath.replace(/[\\/][^\\/]+$/, '')
    await invoke('open_directory', { path: dir })
  } catch {
    store.statusMessage = '打开ClaudeCode路径失败'
  }
}
</script>

<style scoped>
.config-editor {
  flex-shrink: 0;
}

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

.field-inline {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.field-inline .input {
  flex: 1;
  min-width: 0;
}

.effort-select {
  width: 100px;
  flex-shrink: 0;
}

.scope-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 0 8px;
  flex-wrap: wrap;
}

.scope-label {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  width: 110px;
  text-align: right;
  flex-shrink: 0;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
}

.scope-hint {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
}

.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.action-row--tools {
  flex-wrap: wrap;
}

.status-hint {
  margin-top: 6px;
  font-size: var(--font-size-small);
  color: var(--text-secondary);
}
</style>
