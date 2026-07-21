export const MULTILINE_INPUT_SEQUENCE = '\x1b\r'

export interface TerminalShortcutEvent {
  key: string
  code?: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  isComposing: boolean
}

function isEnterKey(event: TerminalShortcutEvent): boolean {
  return event.key === 'Enter'
    || event.code === 'Enter'
    || event.code === 'NumpadEnter'
}

export function terminalShortcutInput(event: TerminalShortcutEvent): string | null {
  if (
    !event.isComposing
    && isEnterKey(event)
    && event.shiftKey
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
  ) {
    return MULTILINE_INPUT_SEQUENCE
  }
  return null
}

export function blocksLegacyMultilineShortcut(event: TerminalShortcutEvent): boolean {
  return !event.isComposing && isEnterKey(event) && event.altKey
}
