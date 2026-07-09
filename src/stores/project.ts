import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useClaudeStore } from './claude'
import { useTerminalStore } from './terminal'
import type { SessionEntry } from '@/types/config'

export type TerminalStatus = 'off' | 'idle' | 'running'
export type SidebarTabType = 'tools' | 'file' | 'terminal' | 'browser'
export type FileViewMode = 'source' | 'preview'
export type ProjectSortMode = 'manual' | 'time'

export interface Project {
  id: string
  name: string
  path: string
  createdAt: number
  updatedAt: number
  order: number
  recentItems: RecentItem[]
}

export interface ProjectSession {
  id: string
  projectId: string
  name: string
  claudeSessionId?: string
  shell?: string[]
  cwd?: string
  env?: Record<string, string>
  createdAt: number
  updatedAt: number
  order: number
}

export interface RecentItem {
  type: 'file' | 'browser' | 'terminal'
  name: string
  path?: string
  url?: string
  openedAt: number
}

export interface SidebarTab {
  id: string
  type: SidebarTabType
  title: string
  path?: string
  url?: string
  browserHistory?: string[]
  browserHistoryIndex?: number
  browserRefreshKey?: number
  terminalId?: number
  content?: string
  dirty?: boolean
  viewMode?: FileViewMode
  language?: string
}

interface ProjectStoreFile {
  projects: Project[]
  sessions: ProjectSession[]
  activeProjectId?: string | null
  activeSessionId?: string | null
  expandedProjectIds: string[]
  projectSortMode?: ProjectSortMode
}

function makeId(prefix: string) {
  const cryptoId = globalThis.crypto?.randomUUID?.()
  return cryptoId ? `${prefix}-${cryptoId}` : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function now() {
  return Date.now()
}

function basename(path: string) {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

function normalizeProjectPath(path: string) {
  return path.trim().replace(/[\\/]+$/, '')
}

function updateClaudeLaunchHistory(claudeStore: ReturnType<typeof useClaudeStore>, path: string) {
  // Update both the current launch dir and the in-memory history so the
  // config-side dropdown stays in sync immediately.
  claudeStore.launchDir = path
  claudeStore.launchDirHistory = [
    path,
    ...claudeStore.launchDirHistory.filter((d) => d.toLowerCase() !== path.toLowerCase()),
  ].slice(0, 20)
}

function extension(path: string) {
  const name = basename(path)
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase()
}

function languageFromPath(path: string) {
  const ext = extension(path)
  const map: Record<string, string> = {
    md: 'markdown',
    markdown: 'markdown',
    txt: 'text',
    log: 'text',
    env: 'env',
    js: 'javascript',
    ts: 'typescript',
    vue: 'vue',
    html: 'html',
    css: 'css',
    rs: 'rust',
    py: 'python',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
  }
  return map[ext] ?? ext
}

function defaultSessionName(existing: ProjectSession[]) {
  if (existing.length === 0) return '主终端'
  return `新会话 ${existing.length + 1}`
}

function historyTimestampToMs(ts: number) {
  if (!ts) return now()
  return ts > 1_000_000_000_000 ? ts : ts * 1000
}

function sessionDisplayName(entry: SessionEntry) {
  return entry.display.replace(/\n/g, ' ').replace(/\r/g, '').trim() || entry.id
}

function normalizeSessionName(name: string) {
  return name.replace(/\n/g, ' ').replace(/\r/g, '').trim()
}

function isDefaultProjectSessionName(name: string) {
  const normalized = normalizeSessionName(name)
  return normalized === '主终端' || /^新会话\s+\d+$/.test(normalized)
}

const HISTORY_BIND_GRACE_MS = 30_000

function projectSessionIdForClaude(projectId: string, claudeSessionId: string) {
  return `session-claude-${projectId}-${claudeSessionId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function browserTitle(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.hostname || '浏览器'
  } catch {
    return basename(url.replace(/\/$/, '')) || '浏览器'
  }
}

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const sessions = ref<ProjectSession[]>([])
  const expandedProjectIds = ref<Set<string>>(new Set())
  const activeProjectId = ref<string | null>(null)
  const activeSessionId = ref<string | null>(null)
  const projectSortMode = ref<ProjectSortMode>('manual')
  const sidebarOpen = ref(false)
  const leftSidebarCollapsed = ref(false)
  const sidebarTabs = ref<SidebarTab[]>([])
  const activeSidebarTabId = ref<string | null>(null)
  const statusMessage = ref('')

  const sessionTerminalIds = ref<Record<string, number>>({})

  const activeProject = computed(() =>
    projects.value.find((p) => p.id === activeProjectId.value) ?? null
  )

  const sessionsOfActiveProject = computed(() =>
    sessions.value
      .filter((s) => s.projectId === activeProjectId.value)
      .sort((a, b) => a.order - b.order)
  )

  const activeSession = computed(() =>
    sessions.value.find((s) => s.id === activeSessionId.value && s.projectId === activeProjectId.value) ?? null
  )

  const activeSidebarTab = computed(() =>
    sidebarTabs.value.find((tab) => tab.id === activeSidebarTabId.value) ?? null
  )

  const recentItemsOfActiveProject = computed(() =>
    [...(activeProject.value?.recentItems ?? [])].sort((a, b) => b.openedAt - a.openedAt)
  )

  async function persist() {
    const data: ProjectStoreFile = {
      projects: projects.value,
      sessions: sessions.value,
      activeProjectId: activeProjectId.value,
      activeSessionId: activeSessionId.value,
      expandedProjectIds: [...expandedProjectIds.value],
      projectSortMode: projectSortMode.value,
    }
    await invoke('save_projects', { data })
  }

  function normalizeActiveState() {
    projects.value.sort((a, b) => a.order - b.order)
    if (activeProjectId.value && !projects.value.some((p) => p.id === activeProjectId.value)) {
      activeProjectId.value = null
    }
    if (!activeProjectId.value && projects.value.length > 0) {
      activeProjectId.value = projects.value[0].id
    }
    if (activeProjectId.value) {
      expandedProjectIds.value.add(activeProjectId.value)
    }

    if (
      activeSessionId.value
      && !sessions.value.some((s) => s.id === activeSessionId.value && s.projectId === activeProjectId.value)
    ) {
      activeSessionId.value = null
    }
    if (!activeSessionId.value) {
      activeSessionId.value = sessionsOfActiveProject.value[0]?.id ?? null
    }
  }

  function findProjectByPath(path: string) {
    const normalizedPath = normalizeProjectPath(path).toLowerCase()
    return projects.value.find((project) => normalizeProjectPath(project.path).toLowerCase() === normalizedPath) ?? null
  }

  function mergeRecentProjectPaths(paths: string[], options: { prepend?: boolean } = {}) {
    const incoming: Project[] = []

    for (const path of paths) {
      if (!path) continue
      const normalized = normalizeProjectPath(path)
      if (!normalized) continue
      const normalizedKey = normalized.toLowerCase()

      if (
        projects.value.some((project) => normalizeProjectPath(project.path).toLowerCase() === normalizedKey)
        || incoming.some((project) => normalizeProjectPath(project.path).toLowerCase() === normalizedKey)
      ) {
        continue
      }

      const ts = now()
      incoming.push({
        id: makeId('project'),
        name: basename(normalized),
        path: normalized,
        createdAt: ts,
        updatedAt: ts,
        order: options.prepend ? incoming.length : projects.value.length + incoming.length,
        recentItems: [],
      })
    }

    if (incoming.length === 0) return false

    if (options.prepend) {
      projects.value = [...incoming, ...projects.value]
      projects.value.forEach((project, index) => {
        project.order = index
      })
    } else {
      projects.value.push(...incoming)
    }

    return true
  }

  function uniqueSessionId(preferredId: string) {
    if (!sessions.value.some((s) => s.id === preferredId)) return preferredId
    return makeId('session')
  }

  function updateSessionTerminalTitle(sessionId: string, title: string) {
    const tabId = sessionTerminalIds.value[sessionId]
    if (tabId) useTerminalStore().updateTabTitle(tabId, title)
  }

  function sessionHasLiveTerminal(sessionId: string) {
    const tabId = sessionTerminalIds.value[sessionId]
    if (!tabId) return false
    const tab = useTerminalStore().tabs.find((item) => item.id === tabId)
    return !!tab?.alive
  }

  function canBindHistoryEntryToLocalSession(session: ProjectSession, timestamp: number) {
    return !session.claudeSessionId
      && sessionHasLiveTerminal(session.id)
      && timestamp + HISTORY_BIND_GRACE_MS >= session.createdAt
  }

  function findLocalSessionForNewHistoryEntry(projectSessions: ProjectSession[], timestamp: number) {
    const candidates = projectSessions
      .filter((session) => canBindHistoryEntryToLocalSession(session, timestamp))
      .sort((a, b) => b.createdAt - a.createdAt)

    return candidates.find((session) => session.id === activeSessionId.value) ?? candidates[0] ?? null
  }

  function removeUnopenedDuplicateSession(projectSessions: ProjectSession[], duplicate: ProjectSession, replacement: ProjectSession) {
    if (duplicate.id === replacement.id) return false
    if (sessionTerminalIds.value[duplicate.id]) return false

    sessions.value = sessions.value.filter((session) => session.id !== duplicate.id)
    const index = projectSessions.findIndex((session) => session.id === duplicate.id)
    if (index !== -1) projectSessions.splice(index, 1)
    if (activeSessionId.value === duplicate.id) {
      activeSessionId.value = replacement.id
    }
    return true
  }

  function pruneClaudeSessionsForProject(projectId: string) {
    sessions.value = sessions.value.filter((session) => {
      if (session.projectId !== projectId) return true
      if (!session.claudeSessionId) return true
      return !!sessionTerminalIds.value[session.id]
    })
  }

  async function syncProjectSessionsFromClaude(projectId: string) {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return false

    let recent: SessionEntry[] = []
    try {
      recent = await invoke<SessionEntry[]>('load_claude_sessions', {
        targetDir: project.path,
      }) ?? []
    } catch {
      return false
    }

    if (recent.length === 0) return false

    let changed = false
    const projectSessions = sessions.value.filter((s) => s.projectId === projectId)
    const reusableLocalSessions = projectSessions.filter(
      (s) => !s.claudeSessionId && !sessionTerminalIds.value[s.id],
    )
    const usedReusableIds = new Set<string>()

    for (const [index, entry] of recent.entries()) {
      const displayName = sessionDisplayName(entry)
      const timestamp = historyTimestampToMs(entry.ts)
      const historySession = projectSessions.find((s) => s.claudeSessionId === entry.id)
      let session = historySession

      if (index === 0) {
        const localSession = findLocalSessionForNewHistoryEntry(projectSessions, timestamp)
        if (localSession && (!historySession || !sessionHasLiveTerminal(historySession.id))) {
          if (historySession && removeUnopenedDuplicateSession(projectSessions, historySession, localSession)) {
            changed = true
          }
          session = localSession
        }
      }

      if (!session) {
        session = reusableLocalSessions.find(
          (s) => !usedReusableIds.has(s.id) && normalizeSessionName(s.name) === displayName,
        )
      }

      if (!session && index === 0) {
        session = reusableLocalSessions.find(
          (s) => !usedReusableIds.has(s.id) && isDefaultProjectSessionName(s.name),
        )
      }

      if (!session) {
        session = {
          id: uniqueSessionId(projectSessionIdForClaude(projectId, entry.id)),
          projectId,
          name: displayName,
          claudeSessionId: entry.id,
          createdAt: timestamp,
          updatedAt: timestamp,
          order: index,
        }
        sessions.value.push(session)
        projectSessions.push(session)
        changed = true
      } else {
        usedReusableIds.add(session.id)
        if (session.name !== displayName) {
          session.name = displayName
          updateSessionTerminalTitle(session.id, displayName)
          changed = true
        }
        if (session.claudeSessionId !== entry.id) {
          session.claudeSessionId = entry.id
          changed = true
        }
        if (session.updatedAt !== timestamp) {
          session.updatedAt = timestamp
          changed = true
        }
        if (session.order !== index) {
          session.order = index
          changed = true
        }
      }
    }

    const recentIds = new Set(recent.map((entry) => entry.id))
    const trailingSessions = sessions.value
      .filter((s) => s.projectId === projectId && !recentIds.has(s.claudeSessionId ?? ''))
      .sort((a, b) => a.order - b.order)

    trailingSessions.forEach((session, index) => {
      const nextOrder = recent.length + index
      if (session.order !== nextOrder) {
        session.order = nextOrder
        changed = true
      }
    })

    return changed
  }

  function ensureProjectHasSession(projectId: string) {
    if (sessions.value.some((s) => s.projectId === projectId)) return
    createSessionRecord(projectId, '主终端', { activate: false })
  }

  async function loadProjects() {
    try {
      // Load the config-side launch directory history first so we can seed the
      // project list if it is empty.
      const claudeStore = useClaudeStore()
      await claudeStore.loadRecentProjects()

      const data = await invoke<ProjectStoreFile>('load_projects')
      projects.value = data.projects ?? []
      sessions.value = data.sessions ?? []
      expandedProjectIds.value = new Set(data.expandedProjectIds ?? [])
      activeProjectId.value = data.activeProjectId ?? null
      activeSessionId.value = data.activeSessionId ?? null
      projectSortMode.value = data.projectSortMode === 'time' ? 'time' : 'manual'

      // Merge recent directories from the config-side launch directory history.
      // This keeps the project list in sync with Claude's own history even when
      // no projects have been explicitly added in this module. Most recent
      // directories appear first on initial load.
      mergeRecentProjectPaths(claudeStore.launchDirHistory, { prepend: true })

      for (const project of projects.value) {
        await syncProjectSessionsFromClaude(project.id)
        ensureProjectHasSession(project.id)
      }

      normalizeActiveState()
      await persist()
    } catch (e) {
      statusMessage.value = `加载项目失败：${e}`
    }
  }

  async function refreshClaudeHistory() {
    const claudeStore = useClaudeStore()
    let changed = mergeRecentProjectPaths(claudeStore.launchDirHistory)

    for (const project of [...projects.value]) {
      if (await syncProjectSessionsFromClaude(project.id)) {
        changed = true
      }

      const sessionCount = sessions.value.length
      ensureProjectHasSession(project.id)
      if (sessions.value.length !== sessionCount) {
        changed = true
      }
    }

    const launchProject = claudeStore.launchDir ? findProjectByPath(claudeStore.launchDir) : null
    if (launchProject && await syncProjectSessionsFromClaude(launchProject.id)) {
      changed = true
    }

    if (changed) {
      normalizeActiveState()
      await persist()
    }

    return changed
  }

  async function pickAndAddProject() {
    const selected = await open({ directory: true, multiple: false, title: '选择项目目录' })
    if (typeof selected === 'string') {
      await addProject(selected)
    }
  }

  async function addProject(path: string, name?: string) {
    const normalizedPath = normalizeProjectPath(path)
    const existing = projects.value.find(
      (p) => normalizeProjectPath(p.path).toLowerCase() === normalizedPath.toLowerCase(),
    )
    if (existing) {
      activeProjectId.value = existing.id
      expandedProjectIds.value.add(existing.id)
      await syncProjectSessionsFromClaude(existing.id)
      normalizeActiveState()
      await persist()
      return existing
    }

    const ts = now()
    const project: Project = {
      id: makeId('project'),
      name: name?.trim() || basename(normalizedPath),
      path: normalizedPath,
      createdAt: ts,
      updatedAt: ts,
      order: projects.value.length,
      recentItems: [],
    }
    projects.value.push(project)
    activeProjectId.value = project.id
    expandedProjectIds.value.add(project.id)

    // Keep the config-side launch directory in sync with the active project.
    const claudeStore = useClaudeStore()
    updateClaudeLaunchHistory(claudeStore, project.path)
    await claudeStore.saveLaunchDir().catch(() => {})

    await syncProjectSessionsFromClaude(project.id)
    ensureProjectHasSession(project.id)
    normalizeActiveState()

    await persist()
    return project
  }

  async function launchClaudeFromConfig(claudeSessionId?: string) {
    const claudeStore = useClaudeStore()
    const launchPath = normalizeProjectPath(claudeStore.launchDir)

    if (!launchPath) {
      claudeStore.statusMessage = '启动目录为空，请先设置启动目录'
      return null
    }

    const project = await addProject(launchPath)
    await syncProjectSessionsFromClaude(project.id)

    let session: ProjectSession | undefined
    if (claudeSessionId) {
      const entry = claudeStore.sessions.find((item) => item.id === claudeSessionId)
      session = sessions.value.find(
        (item) => item.projectId === project.id && item.claudeSessionId === claudeSessionId,
      )

      const timestamp = entry ? historyTimestampToMs(entry.ts) : now()
      const displayName = entry ? sessionDisplayName(entry) : '恢复会话'
      if (!session) {
        session = createSessionRecord(project.id, displayName, {
          id: uniqueSessionId(projectSessionIdForClaude(project.id, claudeSessionId)),
          claudeSessionId,
          createdAt: timestamp,
          updatedAt: now(),
        })
      } else {
        session.name = displayName
        session.updatedAt = now()
        updateSessionTerminalTitle(session.id, displayName)
      }
    } else {
      session = sessions.value.find(
        (item) =>
          item.projectId === project.id
          && !item.claudeSessionId
          && !sessionTerminalIds.value[item.id]
          && isDefaultProjectSessionName(item.name),
      )

      if (session) {
        session.updatedAt = now()
      } else {
        session = createSessionRecord(project.id)
      }
    }

    activeProjectId.value = project.id
    expandedProjectIds.value.add(project.id)
    leftSidebarCollapsed.value = false
    activeSessionId.value = session.id
    await persist()
    await ensureSessionTerminal(session.id)
    return session
  }

  async function removeProject(projectId: string) {
    const terminalStore = useTerminalStore()
    const relatedSessionIds = sessions.value.filter((s) => s.projectId === projectId).map((s) => s.id)
    for (const id of relatedSessionIds) {
      const tabId = sessionTerminalIds.value[id]
      if (tabId) await terminalStore.closeTab(tabId)
      delete sessionTerminalIds.value[id]
    }
    projects.value = projects.value.filter((p) => p.id !== projectId)
    sessions.value = sessions.value.filter((s) => s.projectId !== projectId)
    expandedProjectIds.value.delete(projectId)
    if (activeProjectId.value === projectId) {
      activeProjectId.value = projects.value[0]?.id ?? null
    }
    activeSessionId.value = sessionsOfActiveProject.value[0]?.id ?? null
    await persist()
  }

  async function renameProject(projectId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return
    project.name = trimmed
    project.updatedAt = now()
    await persist()
  }

  async function replaceProjectPath(projectId: string, path: string, name?: string) {
    const project = projects.value.find((p) => p.id === projectId)
    if (!project) return null
    project.path = path
    project.name = name?.trim() || basename(path)
    project.updatedAt = now()
    activeProjectId.value = project.id
    expandedProjectIds.value.add(project.id)
    pruneClaudeSessionsForProject(project.id)
    await syncProjectSessionsFromClaude(project.id)
    ensureProjectHasSession(project.id)
    normalizeActiveState()
    await persist()
    return project
  }

  async function toggleProjectExpanded(projectId: string) {
    if (expandedProjectIds.value.has(projectId)) {
      expandedProjectIds.value.delete(projectId)
    } else {
      expandedProjectIds.value.add(projectId)
    }
    await persist()
  }

  function toggleLeftSidebarCollapsed() {
    leftSidebarCollapsed.value = !leftSidebarCollapsed.value
  }

  async function setProjectSortMode(mode: ProjectSortMode) {
    projectSortMode.value = mode
    await persist()
  }

  async function reorderProjects(projectIds: string[]) {
    if (projectIds.length === 0) return
    const orderById = new Map(projectIds.map((id, index) => [id, index]))
    projects.value.forEach((project) => {
      const order = orderById.get(project.id)
      if (order !== undefined) project.order = order
    })
    projects.value.sort((a, b) => a.order - b.order)
    projectSortMode.value = 'manual'
    await persist()
  }

  async function activateProject(projectId: string) {
    activeProjectId.value = projectId
    expandedProjectIds.value.add(projectId)

    const project = projects.value.find((p) => p.id === projectId)
    if (project) {
      const claudeStore = useClaudeStore()
      updateClaudeLaunchHistory(claudeStore, project.path)
      await claudeStore.saveLaunchDir().catch(() => {})
      await claudeStore.loadSessions().catch(() => {})
      await syncProjectSessionsFromClaude(project.id)
    }

    normalizeActiveState()
    await persist()
  }

  function createSessionRecord(
    projectId: string,
    name?: string,
    options: {
      id?: string
      claudeSessionId?: string
      activate?: boolean
      createdAt?: number
      updatedAt?: number
      order?: number
    } = {},
  ) {
    const projectSessions = sessions.value.filter((s) => s.projectId === projectId)
    const ts = options.createdAt ?? now()
    const session: ProjectSession = {
      id: options.id ?? makeId('session'),
      projectId,
      name: name?.trim() || defaultSessionName(projectSessions),
      claudeSessionId: options.claudeSessionId,
      createdAt: ts,
      updatedAt: options.updatedAt ?? ts,
      order: options.order ?? projectSessions.length,
    }
    sessions.value.push(session)
    if (options.activate !== false) {
      activeProjectId.value = projectId
      expandedProjectIds.value.add(projectId)
      activeSessionId.value = session.id
    }
    return session
  }

  async function createSession(projectId = activeProjectId.value, name?: string) {
    if (!projectId) return null

    const session = createSessionRecord(projectId, name)
    await persist()
    await ensureSessionTerminal(session.id)
    return session
  }

  async function activateSession(sessionId: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    activeProjectId.value = session.projectId
    expandedProjectIds.value.add(session.projectId)
    activeSessionId.value = session.id
    await persist()
    if (getSessionStatus(session.id) === 'off') {
      await ensureSessionTerminal(session.id)
    }
  }

  async function renameSession(sessionId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    session.name = trimmed
    session.updatedAt = now()
    updateSessionTerminalTitle(sessionId, trimmed)
    await persist()
  }

  async function removeSession(sessionId: string) {
    await closeSessionTerminal(sessionId)
    sessions.value = sessions.value.filter((s) => s.id !== sessionId)
    delete sessionTerminalIds.value[sessionId]
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessionsOfActiveProject.value[0]?.id ?? null
    }
    await persist()
  }

  function getSessionStatus(sessionId: string): TerminalStatus {
    const terminalStore = useTerminalStore()
    const tabId = sessionTerminalIds.value[sessionId]
    if (!tabId) return 'off'
    const tab = terminalStore.tabs.find((t) => t.id === tabId)
    if (!tab || !tab.alive) return 'off'
    return tab.active ? 'running' : 'idle'
  }

  async function ensureSessionTerminal(sessionId: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return null
    const project = projects.value.find((p) => p.id === session.projectId)
    if (!project) return null

    const terminalStore = useTerminalStore()
    const existingId = sessionTerminalIds.value[sessionId]
    const existing = terminalStore.tabs.find((t) => t.id === existingId)
    if (existing && existing.alive) return existing.id

    const claudeStore = useClaudeStore()
    if (!claudeStore.claudeExePath) {
      await claudeStore.findClaudeExe()
    }

    const envVars: Record<string, string> = {}
    for (const [key, value] of Object.entries(claudeStore.editingConfig.vars)) {
      if (value) envVars[key] = value
    }

    const args: string[] = []
    if (claudeStore.skipPermissions) args.push('--dangerously-skip-permissions')
    if (session.claudeSessionId) args.push('-r', session.claudeSessionId)
    const cmd = claudeStore.claudeExePath
      ? [claudeStore.claudeExePath, ...args]
      : ['cmd.exe']

    const tabId = await terminalStore.createTab(cmd, envVars, session.cwd || project.path, session.name, {
      scope: 'project',
      projectSessionId: session.id,
      activate: false,
    })
    sessionTerminalIds.value[session.id] = tabId
    return tabId
  }

  async function closeSessionTerminal(sessionId = activeSessionId.value) {
    if (!sessionId) return
    const terminalStore = useTerminalStore()
    const tabId = sessionTerminalIds.value[sessionId]
    if (tabId) {
      await terminalStore.closeTab(tabId)
      delete sessionTerminalIds.value[sessionId]
    }
  }

  function openSidebar(defaultTab: SidebarTabType = 'tools') {
    sidebarOpen.value = true
    if (sidebarTabs.value.length === 0 && defaultTab === 'tools') {
      const tab = makeSidebarTab(defaultTab)
      sidebarTabs.value.push(tab)
      activeSidebarTabId.value = tab.id
    } else if (!activeSidebarTabId.value) {
      activeSidebarTabId.value = sidebarTabs.value[0].id
    }
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  function makeSidebarTab(type: SidebarTabType, payload?: string): SidebarTab {
    const titles: Record<SidebarTabType, string> = {
      tools: '工具',
      file: payload ? basename(payload) : '文件',
      terminal: '终端',
      browser: payload || '浏览器',
    }
    return {
      id: makeId('sidebar'),
      type,
      title: titles[type],
      path: type === 'file' ? payload : undefined,
      url: type === 'browser' ? payload : undefined,
      browserHistory: type === 'browser' && payload ? [payload] : undefined,
      browserHistoryIndex: type === 'browser' && payload ? 0 : undefined,
      browserRefreshKey: type === 'browser' ? 0 : undefined,
      dirty: false,
      viewMode: 'source',
    }
  }

  async function openSidebarTab(type: SidebarTabType, payload?: string) {
    if (type === 'file' && payload) {
      await openFile(payload)
      return
    }
    sidebarOpen.value = true
    const tab = makeSidebarTab(type, payload)
    sidebarTabs.value.push(tab)
    activeSidebarTabId.value = tab.id
    if (type === 'terminal') {
      await createSidebarTerminal(tab.id)
    }
    if (type === 'browser' && payload) {
      recordRecentItem('browser', payload, payload)
    }
  }

  async function closeSidebarTab(tabId: string) {
    const tab = sidebarTabs.value.find((t) => t.id === tabId)
    if (!tab) return
    if (tab.dirty) {
      const confirmed = window.confirm(`${tab.title} 尚未保存，确定关闭吗？`)
      if (!confirmed) return
    }
    if (tab.terminalId) {
      await useTerminalStore().closeTab(tab.terminalId)
    }
    sidebarTabs.value = sidebarTabs.value.filter((t) => t.id !== tabId)
    if (activeSidebarTabId.value === tabId) {
      activeSidebarTabId.value = sidebarTabs.value[0]?.id ?? null
    }
  }

  async function openFile(path?: string) {
    let filePath = path
    if (!filePath) {
      const selected = await open({ multiple: false, title: '选择文件' })
      if (typeof selected !== 'string') return
      filePath = selected
    }

    sidebarOpen.value = true
    const existing = sidebarTabs.value.find((tab) => tab.type === 'file' && tab.path === filePath)
    if (existing) {
      activeSidebarTabId.value = existing.id
      return
    }

    try {
      const content = await invoke<string>('read_text_file', { path: filePath })
      const tab: SidebarTab = {
        ...makeSidebarTab('file', filePath),
        content,
        language: languageFromPath(filePath),
      }
      sidebarTabs.value.push(tab)
      activeSidebarTabId.value = tab.id
      recordRecentItem('file', tab.title, filePath)
    } catch (e) {
      statusMessage.value = String(e)
      window.setTimeout(() => {
        if (statusMessage.value === String(e)) statusMessage.value = ''
      }, 2600)
    }
  }

  async function saveFile(tabId = activeSidebarTabId.value ?? '') {
    const tab = sidebarTabs.value.find((item) => item.id === tabId)
    if (!tab || tab.type !== 'file' || !tab.path) return
    await invoke('save_text_file', { path: tab.path, content: tab.content ?? '' })
    tab.dirty = false
  }

  function updateFileContent(tabId: string, content: string) {
    const tab = sidebarTabs.value.find((item) => item.id === tabId)
    if (!tab || tab.type !== 'file') return
    tab.content = content
    tab.dirty = true
  }

  function setFileViewMode(tabId: string, mode: FileViewMode) {
    const tab = sidebarTabs.value.find((item) => item.id === tabId)
    if (tab) tab.viewMode = mode
  }

  async function createSidebarTerminal(tabId: string) {
    const tab = sidebarTabs.value.find((item) => item.id === tabId)
    if (!tab || tab.terminalId) return
    const project = activeProject.value
    const terminalId = await useTerminalStore().createTab(
      ['cmd.exe'],
      {},
      project?.path ?? null,
      tab.title,
      { scope: 'sidebar', sidebarTabId: tab.id, activate: false },
    )
    tab.terminalId = terminalId
    recordRecentItem('terminal', tab.title, undefined)
  }

  function updateBrowserUrl(tabId: string, url: string, options: { replace?: boolean; record?: boolean } = {}) {
    const tab = sidebarTabs.value.find((item) => item.id === tabId)
    if (!tab || tab.type !== 'browser') return
    tab.url = url
    tab.title = url ? browserTitle(url) : '浏览器'
    tab.browserRefreshKey = (tab.browserRefreshKey ?? 0) + 1

    if (url) {
      const history = tab.browserHistory ?? []
      const currentIndex = tab.browserHistoryIndex ?? history.length - 1
      if (options.replace && currentIndex >= 0) {
        history[currentIndex] = url
        tab.browserHistory = history
        tab.browserHistoryIndex = currentIndex
      } else if (history[currentIndex] !== url) {
        const nextHistory = history.slice(0, currentIndex + 1)
        nextHistory.push(url)
        tab.browserHistory = nextHistory
        tab.browserHistoryIndex = nextHistory.length - 1
      }
    }

    if (url && options.record !== false) recordRecentItem('browser', url, url)
  }

  function goBrowserBack(tabId: string) {
    const tab = sidebarTabs.value.find((item) => item.id === tabId)
    if (!tab || tab.type !== 'browser') return
    const history = tab.browserHistory ?? []
    const currentIndex = tab.browserHistoryIndex ?? history.length - 1
    if (currentIndex <= 0) return
    const nextIndex = currentIndex - 1
    tab.browserHistoryIndex = nextIndex
    updateBrowserUrl(tabId, history[nextIndex], { replace: true, record: true })
  }

  function goBrowserForward(tabId: string) {
    const tab = sidebarTabs.value.find((item) => item.id === tabId)
    if (!tab || tab.type !== 'browser') return
    const history = tab.browserHistory ?? []
    const currentIndex = tab.browserHistoryIndex ?? history.length - 1
    if (currentIndex >= history.length - 1) return
    const nextIndex = currentIndex + 1
    tab.browserHistoryIndex = nextIndex
    updateBrowserUrl(tabId, history[nextIndex], { replace: true, record: true })
  }

  function refreshBrowser(tabId: string) {
    const tab = sidebarTabs.value.find((item) => item.id === tabId)
    if (!tab || tab.type !== 'browser') return
    tab.browserRefreshKey = (tab.browserRefreshKey ?? 0) + 1
  }

  function recordRecentItem(type: RecentItem['type'], name: string, payload?: string) {
    const project = activeProject.value
    if (!project) return
    const item: RecentItem = {
      type,
      name,
      path: type === 'file' ? payload : undefined,
      url: type === 'browser' ? payload : undefined,
      openedAt: now(),
    }
    project.recentItems = [
      item,
      ...project.recentItems.filter((existing) => {
        if (type === 'file') return existing.path !== item.path
        if (type === 'browser') return existing.url !== item.url
        return existing.name !== item.name || existing.type !== item.type
      }),
    ].slice(0, 20)
    project.updatedAt = now()
    persist().catch(() => {})
  }

  async function openRecent(item: RecentItem) {
    if (item.type === 'file' && item.path) {
      await openFile(item.path)
    } else if (item.type === 'browser' && item.url) {
      await openSidebarTab('browser', item.url)
    } else if (item.type === 'terminal') {
      await openSidebarTab('terminal')
    }
  }

  return {
    projects,
    sessions,
    expandedProjectIds,
    activeProjectId,
    activeSessionId,
    projectSortMode,
    sidebarOpen,
    leftSidebarCollapsed,
    sidebarTabs,
    activeSidebarTabId,
    statusMessage,
    sessionTerminalIds,
    activeProject,
    sessionsOfActiveProject,
    activeSession,
    activeSidebarTab,
    recentItemsOfActiveProject,
    loadProjects,
    refreshClaudeHistory,
    pickAndAddProject,
    addProject,
    removeProject,
    renameProject,
    replaceProjectPath,
    toggleProjectExpanded,
    toggleLeftSidebarCollapsed,
    setProjectSortMode,
    reorderProjects,
    activateProject,
    launchClaudeFromConfig,
    createSession,
    activateSession,
    renameSession,
    removeSession,
    getSessionStatus,
    ensureSessionTerminal,
    closeSessionTerminal,
    openSidebar,
    closeSidebar,
    openSidebarTab,
    closeSidebarTab,
    openFile,
    saveFile,
    updateFileContent,
    setFileViewMode,
    createSidebarTerminal,
    updateBrowserUrl,
    goBrowserBack,
    goBrowserForward,
    refreshBrowser,
    recordRecentItem,
    openRecent,
  }
})
