<template>
  <div class="codex-config-panel">
    <aside class="codex-config-panel__sidebar">
      <button class="btn btn-primary sidebar__new-btn" type="button" @click="store.newProfile()">
        新建配置
      </button>

      <div v-if="store.loading" class="codex-config-panel__empty">正在加载…</div>
      <div v-else-if="store.orderedProfiles.length === 0" class="codex-config-panel__empty">
        暂无 CodeX 配置
      </div>
      <button
        v-for="item in store.orderedProfiles"
        v-else
        :key="item.id"
        type="button"
        class="codex-profile-item"
        :class="{
          'codex-profile-item--selected': store.selectedProfileId === item.id,
          'codex-profile-item--applied': store.activeProfileId === item.id,
        }"
        @click="store.selectProfile(item.id)"
      >
        <span class="codex-profile-item__content">
          <strong>{{ item.name }}</strong>
          <small>{{ item.authMode === 'official' ? 'Codex 官方登录' : item.providerId }}</small>
        </span>
        <span
          v-if="profileStateLabel(item.id)"
          class="codex-profile-item__badge"
        >
          {{ profileStateLabel(item.id) }}
        </span>
        <span
          class="codex-profile-item__delete"
          role="button"
          tabindex="0"
          title="删除配置"
          @click.stop="store.deleteProfile(item.id)"
          @keydown.enter.stop="store.deleteProfile(item.id)"
        >×</span>
      </button>
    </aside>

    <main class="codex-config-panel__content">
      <section class="card config-editor">
        <div class="card-title">配置编辑</div>

        <div class="field-row">
          <label class="field-label">配置名称</label>
          <input v-model="profile.name" class="input" type="text" placeholder="输入配置名称" />
        </div>

        <hr class="separator" style="margin: 10px 0;" />

        <div class="field-row">
          <label class="field-label">认证模式</label>
          <div class="radio-group">
            <label class="radio-label">
              <input v-model="profile.authMode" type="radio" value="official" />
              Codex 官方登录
            </label>
            <label class="radio-label">
              <input v-model="profile.authMode" type="radio" value="custom" />
              第三方 API
            </label>
          </div>
        </div>

        <template v-if="profile.authMode === 'official'">
          <div class="field-row">
            <label class="field-label">API 地址</label>
            <input
              v-model="profile.openaiBaseUrl"
              class="input"
              type="text"
              placeholder="留空使用 Codex 官方地址"
            />
          </div>
          <ConfigStatusBanner
            :message="store.authStatusLabel"
            :tone="store.authStatus.error ? 'error' : store.authStatus.hasCredentials ? 'success' : 'info'"
          />
        </template>

        <template v-else>
          <div class="field-row">
            <label class="field-label">API 地址</label>
            <div class="field-inline">
              <input
                v-model="profile.baseUrl"
                class="input"
                type="text"
                placeholder="https://proxy.example.com/v1"
              />
              <button
                class="btn btn-secondary"
                type="button"
                :disabled="store.modelsFetching"
                @click="store.fetchModels()"
              >
                {{ store.modelsFetching ? '获取中…' : '获取模型' }}
              </button>
            </div>
          </div>

          <SecretField
            :key="profile.id || 'new-codex-profile'"
            v-model="store.apiKeyInput"
            label="API Key"
            :has-stored-value="profile.hasStoredApiKey && !store.clearStoredApiKey"
            :stored-value-revealed="store.storedApiKeyRevealed"
            :loading-stored-value="store.apiKeyRevealing"
            :placeholder="profile.hasStoredApiKey ? '已安全保存；点击显示后按需读取' : '可留空并使用现有环境变量'"
            @reveal-stored-value="store.revealApiKey()"
          />

          <div class="field-row">
            <label class="field-label">Provider ID</label>
            <input v-model="profile.providerId" class="input" type="text" placeholder="例如 company_proxy" />
          </div>
          <div class="field-row">
            <label class="field-label">显示名称</label>
            <input v-model="profile.providerName" class="input" type="text" placeholder="例如 Company Proxy" />
          </div>
          <div class="field-row">
            <label class="field-label">Key 环境变量</label>
            <input v-model="profile.envKey" class="input" type="text" placeholder="OPENAI_API_KEY" />
          </div>
          <div class="field-row">
            <label class="field-label">Wire API</label>
            <select v-model="profile.wireApi" class="select">
              <option value="responses">responses</option>
            </select>
          </div>
          <label v-if="profile.hasStoredApiKey" class="clear-secret">
            <input v-model="store.clearStoredApiKey" type="checkbox" />
            删除已加密保存的 API Key，改用系统环境变量
          </label>
        </template>

        <ModelField
          v-model="profile.model"
          label="默认模型"
          :models="store.availableModels"
          placeholder="留空则继承下层配置"
        />

        <div class="field-row">
          <label class="field-label">推理强度</label>
          <div class="field-inline">
            <input
              v-model="profile.reasoningEffort"
              class="input"
              type="text"
              placeholder="minimal / low / medium / high / xhigh / ultra / max"
            />
            <select class="select effort-select" @change="onEffortSelect">
              <option value="" disabled selected>选择</option>
              <option v-for="effort in reasoningEfforts" :key="effort" :value="effort">
                {{ effort }}
              </option>
            </select>
          </div>
        </div>

        <p class="field-help">
          {{ profile.authMode === 'official'
            ? '复用 CLI、桌面端和 IDE 的 Codex 官方登录，不读取、覆盖或清除 auth.json。'
            : secretStorageDescription }}
        </p>

        <hr class="separator" style="margin: 12px 0 10px;" />

        <div class="scope-row">
          <span class="scope-label">应用范围</span>
          <label class="radio-label">
            <input
              v-model="store.syncToGlobal"
              type="checkbox"
              :disabled="globalApplied || (profile.authMode === 'custom' && !store.customGlobalSyncSupported)"
            />
            同时同步到全局配置
          </label>
          <span class="scope-hint">
            {{ globalApplied
              ? '当前方案已经同步到全局；选择另一方案同步时会替换它'
              : '不勾选时只改变启动器当前方案' }}
          </span>
        </div>
        <p v-if="profile.authMode === 'custom' && !store.customGlobalSyncSupported" class="scope-warning">
          macOS 不会把第三方 Key 写入 shell、LaunchAgent 或 Claude 配置。启动器会从 Keychain 读取，并且只注入新启动的 CodeX 子进程；第三方全局同步不可用。
        </p>
        <p v-if="store.syncToGlobal" class="scope-warning">
          <template v-if="profile.authMode === 'official'">
            将更新 {{ store.globalConfigPath || '~/.codex/config.toml' }}；auth.json 保持只读。
          </template>
          <template v-else-if="store.customGlobalKeySyncSupported">
            将更新 {{ store.globalConfigPath || '~/.codex/config.toml' }}；并把
            <code>{{ profile.envKey || 'API Key 环境变量' }}</code> 写入 Windows 当前用户环境。该环境变量不是密文存储；外部终端和 CodeX 桌面端需重启后读取新环境。
          </template>
          <template v-else-if="store.secretStorageKind === 'macos_keychain' && profile.hasStoredApiKey">
            将把第三方 Provider 和模型同步到 {{ store.globalConfigPath || '~/.codex/config.toml' }}，并配置 Codex 的命令式认证从 Keychain 读取 Key。明文不会写入 TOML 或 shell；外部 Codex 首次读取时 macOS 可能请求 Keychain 授权。
          </template>
          <template v-else>
            将把第三方 Provider、模型和 <code>env_key</code> 同步到
            {{ store.globalConfigPath || '~/.codex/config.toml' }}。Key 仍只保存在 Keychain，不会写入 TOML 或 shell；启动器内会自动注入，外部 CodeX 需要自行设置
            <code>{{ profile.envKey || 'API Key 环境变量' }}</code>，或配置 Codex 命令式认证。
          </template>
        </p>

        <div class="action-row">
          <button
            class="btn btn-primary"
            type="button"
            :disabled="!store.isDirty || store.saving || store.apiKeyRevealing"
            @click="store.saveProfile()"
          >
            {{ store.saving ? '保存并校验中…' : store.isDirty ? '保存配置' : '已保存' }}
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="applyDisabled"
            @click="store.applyProfile()"
          >
            {{ applyButtonLabel }}
          </button>
        </div>

        <ConfigStatusBanner
          v-if="store.globalConfigError"
          :message="store.globalConfigError"
          tone="error"
        />
        <ConfigStatusBanner
          v-if="store.statusMessage"
          :message="store.statusMessage"
          :tone="statusTone"
        />

        <div class="preflight-entry">
          <button class="btn btn-secondary" type="button" @click="workspaceStore.openPreflight()">
            启动前检测
          </button>
          <span>检查 CLI、配置来源、实际应用 profile 和脱敏后的启动上下文。</span>
        </div>
      </section>

      <section class="card codex-source-note">
        <div class="card-title">配置边界</div>
        <p>全局配置：{{ store.globalConfigPath || '~/.codex/config.toml' }}</p>
        <p>启动器索引：{{ store.profilesPath || defaultProfilesPath }}</p>
        <p>启动器通过独立的 <code>--profile {{ profile.managedProfileName || 'cc-launcher-…' }}</code> 启动；只有主动勾选“同时同步到全局配置”才修改全局文件。</p>
        <p>CodeX 优先级：CLI 参数 → 项目 <code>.codex/config.toml</code> → 当前启动器 profile → 全局配置。</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useCodexConfigStore } from '@/stores/codexConfig'
import { useConfigWorkspaceStore } from '@/stores/configWorkspace'
import ConfigStatusBanner from '@/components/config/ConfigStatusBanner.vue'
import ModelField from '@/components/config/ModelField.vue'
import SecretField from '@/components/config/SecretField.vue'
import { usePlatform } from '@/composables/usePlatform'

const store = useCodexConfigStore()
const workspaceStore = useConfigWorkspaceStore()
const { isMacOS } = usePlatform()
const profile = computed(() => store.editingProfile)
const defaultProfilesPath = computed(() => isMacOS.value
  ? '~/Library/Application Support/ClaudeEnvManager/codex/profiles.json'
  : '%APPDATA%\\ClaudeEnvManager\\codex\\profiles.json')
const secretStorageDescription = computed(() => store.secretStorageKind === 'macos_keychain'
  ? 'Key 使用 macOS Keychain 按 profile 隔离保存；Codex 通过命令式认证按需读取，明文不会写入配置文件。'
  : 'Key 使用 Windows DPAPI 加密保存，并且只注入启动器创建的 CodeX 子进程。')
watch(
  () => [profile.value.authMode, store.customGlobalSyncSupported] as const,
  ([authMode, supported]) => {
    if (authMode === 'custom' && !supported) store.syncToGlobal = false
  },
)
const reasoningEfforts = ['minimal', 'low', 'medium', 'high', 'xhigh', 'ultra', 'max']
const appApplied = computed(() => Boolean(
  profile.value.id && store.activeProfileId === profile.value.id,
))
const globalApplied = computed(() => Boolean(
  profile.value.id && store.globalProfileId === profile.value.id,
))
const applyDisabled = computed(() => (
  !profile.value.id
  || store.isDirty
  || store.applying
  || store.apiKeyRevealing
  || (appApplied.value && (!store.syncToGlobal
    || (globalApplied.value && store.globalProfileInSync)))
))
const applyButtonLabel = computed(() => {
  if (store.applying) return '应用并校验中…'
  if (!profile.value.id || store.isDirty) return '请先保存'
  if (store.syncToGlobal) {
    if (appApplied.value && globalApplied.value) {
      return store.globalProfileInSync ? '全局应用中' : '重新同步全局'
    }
    return '应用并同步全局'
  }
  if (appApplied.value) return '应用中'
  return '应用此配置'
})
const statusTone = computed<'info' | 'success' | 'warning' | 'error'>(() => {
  if (/失败|错误|无效|不一致|不存在/.test(store.statusMessage)) return 'error'
  if (/已保存|已删除|已切换|已应用|应用中|已获取/.test(store.statusMessage)) return 'success'
  return 'info'
})

function profileStateLabel(profileId: string) {
  const active = store.activeProfileId === profileId
  const global = store.globalProfileId === profileId
  const globalStale = global && !store.globalProfileInSync
  if (active && globalStale) return '应用中 · 全局待更新'
  if (active && global) return '应用中 · 全局'
  if (active) return '应用中'
  if (globalStale) return '全局待更新'
  if (global) return '全局'
  return ''
}

function onEffortSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value) profile.value.reasoningEffort = value
  ;(event.target as HTMLSelectElement).value = ''
}

onMounted(() => {
  store.loadProfiles().catch(() => {})
})
</script>

<style scoped>
.codex-config-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  background: var(--bg);
}

.codex-config-panel__sidebar {
  width: 280px;
  flex: 0 0 auto;
  padding: 12px;
  overflow-y: auto;
  border-right: 1px solid var(--separator);
  background: var(--bg);
}

.sidebar__new-btn {
  width: 100%;
  margin-bottom: 8px;
}

.codex-config-panel__empty {
  padding: 18px 8px;
  color: var(--text-secondary);
  text-align: center;
  font-size: var(--font-size-small);
}

.codex-profile-item {
  width: 100%;
  margin-bottom: 3px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.codex-profile-item:hover { background: var(--tab-bg); }
.codex-profile-item--selected { color: #fff; background: var(--primary); }
.codex-profile-item--selected:hover { background: var(--primary-hover); }
.codex-profile-item--applied { box-shadow: inset 3px 0 var(--success, #22c55e); }

.codex-profile-item__content {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.codex-profile-item__content strong,
.codex-profile-item__content small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.codex-profile-item__content small { opacity: 0.72; font-size: var(--font-size-small); }
.codex-profile-item__badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;
  background: var(--success, #22c55e);
  font-size: 11px;
}
.codex-profile-item__delete { padding: 2px 4px; border-radius: 4px; font-size: 18px; }
.codex-profile-item__delete:hover { background: rgba(255, 255, 255, 0.2); }

.codex-config-panel__content {
  min-width: 0;
  flex: 1;
  padding: 12px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-editor { flex-shrink: 0; }

.field-row {
  min-width: 0;
  padding: 5px 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.field-row > .input,
.field-row > .select { min-width: 0; flex: 1; }

.field-label,
.scope-label {
  width: 110px;
  flex-shrink: 0;
  color: var(--text-secondary);
  text-align: right;
  font-size: var(--font-size-base);
}

.field-inline {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.field-inline .input { min-width: 0; flex: 1; }
.effort-select { width: 100px; flex-shrink: 0; }

.radio-group,
.scope-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.scope-row { padding: 4px 0 8px; }
.radio-label,
.clear-secret {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-primary);
  font-size: var(--font-size-base);
  cursor: pointer;
  user-select: none;
}

.clear-secret,
.field-help,
.scope-warning { margin: 5px 0 8px 120px; }

.field-help,
.scope-hint,
.scope-warning,
.codex-source-note p {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  line-height: 1.55;
}

.scope-warning { color: var(--warning, #b26a00); overflow-wrap: anywhere; }
.action-row {
  padding: 4px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.preflight-entry {
  margin-top: 10px;
  padding-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--separator);
}

.preflight-entry span {
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  line-height: 1.45;
}

.codex-source-note p + p { margin-top: 5px; }

@media (max-width: 820px) {
  .codex-config-panel__sidebar { width: 220px; }
}
</style>
