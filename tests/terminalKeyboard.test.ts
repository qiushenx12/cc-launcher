import test from 'node:test'
import assert from 'node:assert/strict'
import {
  blocksLegacyMultilineShortcut,
  MULTILINE_INPUT_SEQUENCE,
  terminalShortcutInput,
  type TerminalShortcutEvent,
} from '../src/utils/terminalKeyboard.ts'

const baseEvent: TerminalShortcutEvent = {
  key: 'Enter',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  isComposing: false,
}

test('Shift+Enter emits the CLI multiline input sequence', () => {
  assert.equal(
    terminalShortcutInput({ ...baseEvent, shiftKey: true }),
    MULTILINE_INPUT_SEQUENCE,
  )
  assert.equal(MULTILINE_INPUT_SEQUENCE, '\x1b\r')
})

test('Shift+Enter is recognized from the physical key code', () => {
  assert.equal(
    terminalShortcutInput({ ...baseEvent, key: '', code: 'Enter', shiftKey: true }),
    MULTILINE_INPUT_SEQUENCE,
  )
  assert.equal(
    terminalShortcutInput({ ...baseEvent, key: '', code: 'NumpadEnter', shiftKey: true }),
    MULTILINE_INPUT_SEQUENCE,
  )
})

test('plain Enter remains available for submission', () => {
  assert.equal(terminalShortcutInput(baseEvent), null)
  assert.equal(blocksLegacyMultilineShortcut(baseEvent), false)
})

test('Alt+Enter is blocked instead of emitting the multiline sequence', () => {
  const altEnter = { ...baseEvent, altKey: true }
  assert.equal(terminalShortcutInput(altEnter), null)
  assert.equal(blocksLegacyMultilineShortcut(altEnter), true)
})

test('IME composition and additional modifiers are not intercepted', () => {
  assert.equal(
    terminalShortcutInput({ ...baseEvent, shiftKey: true, isComposing: true }),
    null,
  )
  assert.equal(
    terminalShortcutInput({ ...baseEvent, shiftKey: true, altKey: true }),
    null,
  )
  assert.equal(
    terminalShortcutInput({ ...baseEvent, shiftKey: true, ctrlKey: true }),
    null,
  )
  assert.equal(
    terminalShortcutInput({ ...baseEvent, shiftKey: true, metaKey: true }),
    null,
  )
  assert.equal(
    blocksLegacyMultilineShortcut({ ...baseEvent, altKey: true, isComposing: true }),
    false,
  )
})
