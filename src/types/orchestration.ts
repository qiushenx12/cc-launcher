export interface AgentRole {
  name: string
  description: string
  systemPrompt: string
}

export interface OrchestrationPreset {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  agents: VirtualAgent[]
  connections: VirtualConnection[]
  layout: Record<string, { x: number; y: number }>
}

export interface VirtualAgent {
  id: string
  name: string
  role: AgentRole
  launchConfig: {
    agentType: 'claude' | 'terminal'
    cmd: string[]
    env: Record<string, string>
    cwd: string | null
  }
}

export interface VirtualConnection {
  from: string   // VirtualAgent.id
  to: string     // VirtualAgent.id
}

export interface PresetEntry {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}
