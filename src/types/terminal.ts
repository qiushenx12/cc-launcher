export interface TerminalTab {
  id: number
  title: string
  alive: boolean
  active: boolean
  titleEdited: boolean
  sessionId?: string
  scope?: 'terminal' | 'project' | 'sidebar'
  projectSessionId?: string
  sidebarTabId?: string
}

export interface PtyOutput {
  tab_id: number
  data: string
}

export interface PtyStatus {
  tab_id: number
  alive: boolean
}

export interface PtyTitle {
  tab_id: number
  title: string
  has_spinner: boolean
}

import type { AgentRole } from './orchestration'

// Tab communication permission config
export interface TabPermission {
  enabled: boolean
  allowedTargets: number[]
}

// Snapshot types
export interface SnapshotTabEntry {
  tab_id: number
  title: string
  session_id?: string
  permission: TabPermission
  role?: AgentRole
}

export interface CanvasItemSnapshot {
  tabId: number
  x: number
  y: number
}

export interface TerminalSnapshot {
  project_path: string
  timestamp: string
  tabs: SnapshotTabEntry[]
  canvas: {
    items: CanvasItemSnapshot[]
    connections: { from: number; to: number }[]
  }
}

export interface SnapshotEntry {
  id: string
  project_path: string
  timestamp: string
}
