<template>
  <aside
    ref="sidebarRef"
    class="right-sidebar"
    :style="props.width ? { width: `${props.width}px`, flexBasis: `${props.width}px` } : undefined"
  >
    <header class="right-sidebar__tabs">
      <div class="right-sidebar__tab-strip">
        <button
          v-for="tab in store.sidebarTabs"
          :key="tab.id"
          class="right-sidebar__tab"
          :class="{ active: tab.id === store.activeSidebarTabId }"
          @click="store.activeSidebarTabId = tab.id"
        >
          <span class="right-sidebar__tab-name">{{ tab.title }}</span>
          <span v-if="tab.dirty" class="right-sidebar__dirty">●</span>
          <span class="right-sidebar__tab-close" @click.stop="store.closeSidebarTab(tab.id)">×</span>
        </button>
      </div>
      <button class="right-sidebar__add" title="打开功能" @click="addMenuOpen = !addMenuOpen">+</button>
      <div v-if="addMenuOpen" class="right-sidebar__add-menu">
        <button @click="openFile">📄 <span>文件</span><kbd>Ctrl+P</kbd></button>
        <button @click="openTerminal">🖥 <span>终端</span></button>
        <button @click="openBrowser">🌐 <span>浏览器</span></button>
      </div>
    </header>

    <section class="right-sidebar__body">
      <ToolsPanel v-if="activeTab?.type === 'tools'" />
      <FilePanel v-else-if="activeTab?.type === 'file' && activeTab" :tab-id="activeTab.id" />
      <TerminalPanel v-else-if="activeTab?.type === 'terminal' && activeTab" :tab-id="activeTab.id" />
      <BrowserPanel v-else-if="activeTab?.type === 'browser' && activeTab" :tab-id="activeTab.id" />
      <div v-else class="right-sidebar__empty">点击 + 打开功能</div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useTauriDrop, isInside } from '@/composables/useTauriDrop'
import TerminalPane from '@/components/terminal/TerminalPane.vue'

const store = useProjectStore()
const addMenuOpen = ref(false)
const sidebarRef = ref<HTMLElement | null>(null)
const activeTab = computed(() => store.activeSidebarTab)

const props = defineProps<{
  width?: number
}>()

useTauriDrop((paths, position) => {
  if (isInside(position, sidebarRef.value) && paths[0]) {
    store.openFile(paths[0])
  }
})

async function openFile() {
  addMenuOpen.value = false
  await store.openFile()
}

async function openTerminal() {
  addMenuOpen.value = false
  await store.openSidebarTab('terminal')
}

async function openBrowser() {
  addMenuOpen.value = false
  await store.openSidebarTab('browser')
}

const ToolsPanel = defineComponent({
  setup() {
    const projectStore = useProjectStore()
    return () => h('div', { class: 'tools-panel' }, [
      h('div', { class: 'tools-panel__section' }, [
        h('div', { class: 'tools-panel__title' }, '打开'),
        h('button', { class: 'tools-panel__row', onClick: () => projectStore.openFile() }, ['📄 ', h('span', '文件'), h('kbd', 'Ctrl+P')]),
        h('button', { class: 'tools-panel__row', onClick: () => projectStore.openSidebarTab('terminal') }, ['🖥 ', h('span', '终端')]),
        h('button', { class: 'tools-panel__row', onClick: () => projectStore.openSidebarTab('browser') }, ['🌐 ', h('span', '浏览器')]),
      ]),
      h('div', { class: 'tools-panel__section' }, [
        h('div', { class: 'tools-panel__title' }, `最近（${projectStore.activeProject?.name ?? '未选择项目'}）`),
        projectStore.recentItemsOfActiveProject.length === 0
          ? h('div', { class: 'tools-panel__empty' }, '暂无最近记录')
          : projectStore.recentItemsOfActiveProject.map((item) =>
              h('button', { class: 'tools-panel__row', onClick: () => projectStore.openRecent(item) }, [
                item.type === 'file' ? '📝 ' : item.type === 'browser' ? '🌐 ' : '🖥 ',
                h('span', item.name),
              ]),
            ),
      ]),
    ])
  },
})

const FilePanel = defineComponent({
  props: {
    tabId: { type: String, required: true },
  },
  setup(props) {
    const projectStore = useProjectStore()
    const tab = computed(() => projectStore.sidebarTabs.find((item) => item.id === props.tabId))
    const isMarkdown = computed(() => {
      const lang = tab.value?.language
      return lang === 'markdown'
    })
    function markdownPreview(source: string) {
      const escaped = source
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return escaped
        .split('\n')
        .map((line) => {
          if (line.startsWith('# ')) return `<h3>${line.slice(2)}</h3>`
          if (line.startsWith('## ')) return `<h4>${line.slice(3)}</h4>`
          if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`
          if (!line.trim()) return '<br />'
          return `<p>${line}</p>`
        })
        .join('')
    }
    return () => {
      const current = tab.value
      if (!current) return h('div', { class: 'right-sidebar__empty' }, '文件不存在')
      const content = current.content ?? ''
      return h('div', { class: 'file-panel' }, [
        h('div', { class: 'file-panel__toolbar' }, [
          h('span', `${current.dirty ? '● ' : ''}${current.title}`),
          isMarkdown.value
            ? h('div', { class: 'file-panel__switch' }, [
                h('button', {
                  class: { active: current.viewMode !== 'preview' },
                  onClick: () => projectStore.setFileViewMode(current.id, 'source'),
                }, '源码'),
                h('button', {
                  class: { active: current.viewMode === 'preview' },
                  onClick: () => projectStore.setFileViewMode(current.id, 'preview'),
                }, '预览'),
              ])
            : h('span', { class: 'file-panel__language' }, current.language || 'text'),
        ]),
        current.viewMode === 'preview' && isMarkdown.value
          ? h('div', { class: 'file-panel__preview', innerHTML: markdownPreview(content) })
          : h('textarea', {
              class: 'file-panel__editor',
              value: content,
              spellcheck: 'false',
              onInput: (event: Event) => projectStore.updateFileContent(current.id, (event.target as HTMLTextAreaElement).value),
            }),
      ])
    }
  },
})

const TerminalPanel = defineComponent({
  props: {
    tabId: { type: String, required: true },
  },
  setup(props) {
    const projectStore = useProjectStore()
    const tab = computed(() => projectStore.sidebarTabs.find((item) => item.id === props.tabId))
    return () => {
      const terminalId = tab.value?.terminalId
      return h('div', { class: 'terminal-panel' }, terminalId
        ? [h(TerminalPane, { tabId: terminalId, active: true })]
        : [h('button', { class: 'btn btn-primary', onClick: () => projectStore.createSidebarTerminal(props.tabId) }, '启动辅助终端')])
    }
  },
})

const BrowserPanel = defineComponent({
  props: {
    tabId: { type: String, required: true },
  },
  setup(props) {
    const projectStore = useProjectStore()
    const inputValue = ref('')
    const tab = computed(() => projectStore.sidebarTabs.find((item) => item.id === props.tabId))
    const canGoBack = computed(() => {
      const current = tab.value
      if (!current?.browserHistory) return false
      return (current.browserHistoryIndex ?? current.browserHistory.length - 1) > 0
    })
    const canGoForward = computed(() => {
      const current = tab.value
      if (!current?.browserHistory) return false
      const index = current.browserHistoryIndex ?? current.browserHistory.length - 1
      return index < current.browserHistory.length - 1
    })
    watch(() => tab.value?.url, (url) => {
      inputValue.value = url ?? ''
    }, { immediate: true })
    function openUrl() {
      const raw = inputValue.value.trim()
      if (!raw) return
      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
      projectStore.updateBrowserUrl(props.tabId, url)
    }
    return () => h('div', { class: 'browser-panel' }, [
      h('div', { class: 'browser-panel__bar' }, [
        h('button', {
          disabled: !canGoBack.value,
          title: '后退',
          onClick: () => projectStore.goBrowserBack(props.tabId),
        }, '‹'),
        h('button', {
          disabled: !canGoForward.value,
          title: '前进',
          onClick: () => projectStore.goBrowserForward(props.tabId),
        }, '›'),
        h('button', {
          disabled: !tab.value?.url,
          title: '刷新',
          onClick: () => projectStore.refreshBrowser(props.tabId),
        }, '↻'),
        h('input', {
          value: inputValue.value,
          placeholder: '输入 URL...',
          onInput: (event: Event) => { inputValue.value = (event.target as HTMLInputElement).value },
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Enter') openUrl()
          },
        }),
      ]),
      tab.value?.url
        ? h('iframe', {
            key: `${tab.value.url}:${tab.value.browserRefreshKey ?? 0}`,
            class: 'browser-panel__frame',
            src: tab.value.url,
          })
        : h('div', { class: 'browser-panel__empty' }, '输入 URL 以打开页面'),
    ])
  },
})
</script>

<style scoped>
.right-sidebar {
  width: 320px;
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--separator);
  background: var(--card);
}

.right-sidebar__tabs {
  height: 42px;
  flex: 0 0 42px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border-bottom: 1px solid var(--separator);
  position: relative;
}

.right-sidebar__tab-strip {
  min-width: 0;
  flex: 1;
  display: flex;
  gap: 4px;
  overflow: hidden;
}

.right-sidebar__tab {
  max-width: 96px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text-secondary);
  cursor: pointer;
}

.right-sidebar__tab.active {
  color: var(--text-primary);
  background: var(--card);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.right-sidebar__tab-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right-sidebar__dirty {
  color: var(--dot-running);
  font-size: 9px;
}

.right-sidebar__tab-close {
  flex: 0 0 auto;
  opacity: 0.65;
}

.right-sidebar__add {
  width: 28px;
  height: 28px;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--primary);
  cursor: pointer;
}

.right-sidebar__add-menu {
  position: absolute;
  top: 36px;
  right: 6px;
  z-index: 20;
  width: 190px;
  padding: 6px;
  border: 1px solid var(--separator);
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}

.right-sidebar__add-menu button,
:deep(.tools-panel__row) {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-base);
  text-align: left;
  cursor: pointer;
}

.right-sidebar__add-menu button:hover,
:deep(.tools-panel__row:hover) {
  background: var(--tab-bg);
}

.right-sidebar__add-menu span,
:deep(.tools-panel__row span) {
  flex: 1;
}

kbd,
:deep(kbd) {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 400;
}

.right-sidebar__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.right-sidebar__empty,
:deep(.tools-panel__empty),
:deep(.browser-panel__empty) {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-secondary);
}

:deep(.tools-panel) {
  height: 100%;
  overflow: auto;
  padding: 10px;
}

:deep(.tools-panel__section) {
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--separator);
}

:deep(.tools-panel__title) {
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  font-weight: 700;
}

:deep(.file-panel) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

:deep(.file-panel__toolbar) {
  height: 38px;
  flex: 0 0 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  border-bottom: 1px solid var(--separator);
  color: var(--text-secondary);
  font-size: var(--font-size-small);
}

:deep(.file-panel__switch) {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  background: var(--bg);
}

:deep(.file-panel__switch button) {
  border: 0;
  border-radius: 4px;
  padding: 3px 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

:deep(.file-panel__switch button.active) {
  background: var(--card);
  color: var(--primary);
}

:deep(.file-panel__language) {
  font-family: var(--font-mono);
}

:deep(.file-panel__editor) {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: 0;
  outline: 0;
  padding: 12px;
  color: var(--text-primary);
  background: var(--card);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.65;
}

:deep(.file-panel__preview) {
  flex: 1;
  overflow: auto;
  padding: 14px;
  color: var(--text-primary);
}

:deep(.file-panel__preview h3),
:deep(.file-panel__preview h4) {
  margin: 0 0 10px;
}

:deep(.file-panel__preview p) {
  margin: 0 0 8px;
}

:deep(.file-panel__preview li) {
  margin-left: 18px;
}

:deep(.terminal-panel) {
  height: 100%;
  position: relative;
  background: var(--terminal-bg);
  display: grid;
  place-items: center;
}

:deep(.browser-panel) {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

:deep(.browser-panel__bar) {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border-bottom: 1px solid var(--separator);
}

:deep(.browser-panel__bar button) {
  width: 26px;
  height: 26px;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  background: var(--card);
  color: var(--text-secondary);
}

:deep(.browser-panel__bar button:disabled) {
  opacity: 0.4;
  cursor: default;
}

:deep(.browser-panel__bar input) {
  flex: 1;
  min-width: 0;
  height: 26px;
  border: 1px solid var(--separator);
  border-radius: var(--radius-sm);
  padding: 0 8px;
  background: var(--input-bg);
  color: var(--text-primary);
}

:deep(.browser-panel__frame) {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}
</style>
