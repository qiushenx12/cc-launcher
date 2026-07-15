import type { CliKind } from '../types/cli'

const SYNC_START = Uint8Array.from([0x1b, 0x5b, 0x3f, 0x32, 0x30, 0x32, 0x36, 0x68])
const SYNC_END = Uint8Array.from([0x1b, 0x5b, 0x3f, 0x32, 0x30, 0x32, 0x36, 0x6c])
const ED2 = Uint8Array.from([0x1b, 0x5b, 0x32, 0x4a])
const ED3 = Uint8Array.from([0x1b, 0x5b, 0x33, 0x4a])
const RESET_CURSOR_STYLE = Uint8Array.from([0x1b, 0x5b, 0x30, 0x20, 0x71])
const HIDE_CURSOR = Uint8Array.from([0x1b, 0x5b, 0x3f, 0x32, 0x35, 0x6c])
const SHOW_CURSOR = Uint8Array.from([0x1b, 0x5b, 0x3f, 0x32, 0x35, 0x68])
const ENTER_ALT_SCREEN = Uint8Array.from([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x68])
const LEAVE_ALT_SCREEN = Uint8Array.from([0x1b, 0x5b, 0x3f, 0x31, 0x30, 0x34, 0x39, 0x6c])

const DEFAULT_TIMEOUT_MS = 1000
const DEFAULT_MAX_BUFFERED_BYTES = 2 * 1024 * 1024

export interface TerminalOutputWriter {
  write(data: Uint8Array): void
  dispose(): void
}

interface StabilizerOptions {
  timeoutMs?: number
  maxBufferedBytes?: number
  forceAltScreen?: boolean
  gateCursorDuringOutput?: boolean
  cursorIdleDelayMs?: number
}

type OutputSink = (data: Uint8Array) => void

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length === 0) return right.slice()
  if (right.length === 0) return left.slice()
  const result = new Uint8Array(left.length + right.length)
  result.set(left)
  result.set(right, left.length)
  return result
}

function concatByteArrays(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function matchesAt(data: Uint8Array, sequence: Uint8Array, offset: number): boolean {
  if (offset + sequence.length > data.length) return false
  for (let index = 0; index < sequence.length; index++) {
    if (data[offset + index] !== sequence[index]) return false
  }
  return true
}

function stripSequences(data: Uint8Array, sequences: Uint8Array[]): Uint8Array {
  const filtered = new Uint8Array(data.length)
  let readOffset = 0
  let writeOffset = 0

  while (readOffset < data.length) {
    const blocked = sequences.find(sequence => matchesAt(data, sequence, readOffset))
    if (blocked) {
      readOffset += blocked.length
      continue
    }
    filtered[writeOffset++] = data[readOffset++]
  }

  return filtered.slice(0, writeOffset)
}

function indexOfSequence(data: Uint8Array, sequence: Uint8Array): number {
  const lastStart = data.length - sequence.length
  for (let offset = 0; offset <= lastStart; offset++) {
    if (matchesAt(data, sequence, offset)) return offset
  }
  return -1
}

function trailingPrefixLength(data: Uint8Array, sequence: Uint8Array): number {
  const maxLength = Math.min(data.length, sequence.length - 1)
  for (let length = maxLength; length > 0; length--) {
    let matches = true
    for (let index = 0; index < length; index++) {
      if (data[data.length - length + index] !== sequence[index]) {
        matches = false
        break
      }
    }
    if (matches) return length
  }
  return 0
}

function stabilizeFrame(
  frame: Uint8Array,
  initialCursorVisible: boolean,
  ownsAlternateScreen: boolean,
  ownsCursorVisibility: boolean,
): { data: Uint8Array; cursorVisible: boolean } {
  const blockedSequences = [
    ED2,
    ED3,
    RESET_CURSOR_STYLE,
    ...(ownsAlternateScreen ? [ENTER_ALT_SCREEN, LEAVE_ALT_SCREEN] : []),
  ]
  const body = frame.slice(SYNC_START.length, frame.length - SYNC_END.length)
  const filtered = new Uint8Array(body.length)
  let cursorVisible = initialCursorVisible
  let readOffset = 0
  let writeOffset = 0

  while (readOffset < body.length) {
    if (matchesAt(body, HIDE_CURSOR, readOffset)) {
      cursorVisible = false
      readOffset += HIDE_CURSOR.length
      continue
    }
    if (matchesAt(body, SHOW_CURSOR, readOffset)) {
      cursorVisible = true
      readOffset += SHOW_CURSOR.length
      continue
    }

    const blocked = blockedSequences.find(sequence => matchesAt(body, sequence, readOffset))
    if (blocked) {
      readOffset += blocked.length
      continue
    }
    filtered[writeOffset++] = body[readOffset++]
  }

  const cursorSequences = ownsCursorVisibility
    ? []
    : [HIDE_CURSOR, cursorVisible ? SHOW_CURSOR : HIDE_CURSOR]
  return {
    data: concatByteArrays([
      SYNC_START,
      ...cursorSequences.slice(0, 1),
      filtered.slice(0, writeOffset),
      ...cursorSequences.slice(1),
      SYNC_END,
    ]),
    cursorVisible,
  }
}

class CodexTerminalOutputWriter implements TerminalOutputWriter {
  private pending: Uint8Array<ArrayBufferLike> = new Uint8Array()
  private bufferingFrame = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly timeoutMs: number
  private readonly maxBufferedBytes: number
  private readonly sink: OutputSink
  private readonly ownsAlternateScreen: boolean
  private readonly ownsCursorVisibility: boolean
  private readonly cursorIdleDelayMs: number
  private cursorRestoreTimer: ReturnType<typeof setTimeout> | null = null
  private cursorGateActive = false
  private cursorVisible = true
  private cursorScanTail = new Uint8Array()

  constructor(
    sink: OutputSink,
    options: StabilizerOptions = {},
  ) {
    this.sink = sink
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxBufferedBytes = options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES
    this.ownsAlternateScreen = options.forceAltScreen ?? false
    this.ownsCursorVisibility = options.gateCursorDuringOutput ?? false
    this.cursorIdleDelayMs = options.cursorIdleDelayMs ?? 80
    if (this.ownsAlternateScreen) this.sink(ENTER_ALT_SCREEN)
  }

  write(data: Uint8Array): void {
    if (data.length === 0) return
    this.beginOutputBurst()
    this.pending = concatBytes(this.pending, data)
    this.processPending()
    if (!this.bufferingFrame && this.pending.length === 0) this.scheduleCursorRestore()
  }

  dispose(): void {
    this.clearFlushTimer()
    this.clearCursorRestoreTimer()
    this.flushRawPending()
    if (this.ownsAlternateScreen) this.sink(LEAVE_ALT_SCREEN)
  }

  private processPending(): void {
    while (this.pending.length > 0) {
      if (!this.bufferingFrame) {
        const startOffset = indexOfSequence(this.pending, SYNC_START)
        if (startOffset < 0) {
          const retainedLength = Math.max(
            trailingPrefixLength(this.pending, SYNC_START),
            ...(this.ownsAlternateScreen
              ? [
                  trailingPrefixLength(this.pending, ENTER_ALT_SCREEN),
                  trailingPrefixLength(this.pending, LEAVE_ALT_SCREEN),
                ]
              : []),
            ...(this.ownsCursorVisibility
              ? [
                  trailingPrefixLength(this.pending, HIDE_CURSOR),
                  trailingPrefixLength(this.pending, SHOW_CURSOR),
                ]
              : []),
          )
          const emitLength = this.pending.length - retainedLength
          if (emitLength > 0) {
            this.emit(this.pending.slice(0, emitLength))
            this.pending = this.pending.slice(emitLength)
          }
          if (this.pending.length > 0) this.scheduleFlush()
          return
        }

        if (startOffset > 0) this.emit(this.pending.slice(0, startOffset))
        this.pending = this.pending.slice(startOffset)
        this.bufferingFrame = true
        this.scheduleFlush()
      }

      const endOffset = indexOfSequence(this.pending, SYNC_END)
      if (endOffset < 0) {
        if (this.pending.length > this.maxBufferedBytes) this.flushRawPending()
        return
      }

      const frameEnd = endOffset + SYNC_END.length
      const stabilized = stabilizeFrame(
        this.pending.slice(0, frameEnd),
        this.cursorVisible,
        this.ownsAlternateScreen,
        this.ownsCursorVisibility,
      )
      this.cursorVisible = stabilized.cursorVisible
      this.emit(stabilized.data)
      this.pending = this.pending.slice(frameEnd)
      this.bufferingFrame = false
      this.clearFlushTimer()
    }
  }

  private emit(data: Uint8Array): void {
    if (data.length === 0) return
    const filtered = this.ownsAlternateScreen
      ? stripSequences(data, [ENTER_ALT_SCREEN, LEAVE_ALT_SCREEN])
      : data
    const cursorFiltered = this.ownsCursorVisibility
      ? stripSequences(filtered, [HIDE_CURSOR, SHOW_CURSOR])
      : filtered
    if (cursorFiltered.length === 0) return
    if (!this.ownsCursorVisibility) this.trackCursorVisibility(cursorFiltered)
    this.sink(cursorFiltered)
  }

  private trackCursorVisibility(data: Uint8Array): void {
    const combined = concatBytes(this.cursorScanTail, data)
    for (let offset = 0; offset < combined.length; offset++) {
      if (matchesAt(combined, HIDE_CURSOR, offset)) {
        this.cursorVisible = false
        offset += HIDE_CURSOR.length - 1
      } else if (matchesAt(combined, SHOW_CURSOR, offset)) {
        this.cursorVisible = true
        offset += SHOW_CURSOR.length - 1
      }
    }
    const retainedLength = Math.min(combined.length, SHOW_CURSOR.length - 1)
    this.cursorScanTail = combined.slice(combined.length - retainedLength)
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flushRawPending()
      this.scheduleCursorRestore()
    }, this.timeoutMs)
  }

  private beginOutputBurst(): void {
    if (!this.ownsCursorVisibility) return
    this.clearCursorRestoreTimer()
    if (this.cursorGateActive) return
    this.cursorGateActive = true
    this.sink(HIDE_CURSOR)
    this.cursorVisible = false
  }

  private scheduleCursorRestore(): void {
    if (!this.ownsCursorVisibility || this.cursorRestoreTimer !== null) return
    this.cursorRestoreTimer = setTimeout(() => {
      this.cursorRestoreTimer = null
      this.cursorGateActive = false
      this.sink(SHOW_CURSOR)
      this.cursorVisible = true
    }, this.cursorIdleDelayMs)
  }

  private clearCursorRestoreTimer(): void {
    if (this.cursorRestoreTimer === null) return
    clearTimeout(this.cursorRestoreTimer)
    this.cursorRestoreTimer = null
  }

  private clearFlushTimer(): void {
    if (this.flushTimer === null) return
    clearTimeout(this.flushTimer)
    this.flushTimer = null
  }

  private flushRawPending(): void {
    this.clearFlushTimer()
    this.emit(this.pending)
    this.pending = new Uint8Array()
    this.bufferingFrame = false
  }
}

export function createTerminalOutputWriter(
  cliKind: CliKind,
  sink: OutputSink,
  options: StabilizerOptions = {},
): TerminalOutputWriter {
  if (cliKind === 'codex') return new CodexTerminalOutputWriter(sink, options)
  return {
    write: sink,
    dispose() {},
  }
}
