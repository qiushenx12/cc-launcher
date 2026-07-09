export interface EnvConfig {
  name: string
  vars: Record<string, string>
}

export interface ClaudeSettings {
  skipPermissions: boolean
  awaySummaryDisabled: boolean
}

export interface SessionEntry {
  id: string
  display: string
  ts: number
}

export interface WindowState {
  width: number
  height: number
  x: number
  y: number
  paneSizes: number[]
}
