import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { Terminal } from '@xterm/xterm'
import type { PtyOutput, PtyStatus } from '@/types/terminal'

export function usePtyBridge(tabId: Ref<number>, terminal: Ref<Terminal | null>) {
  const alive = ref(true)
  const unlisteners: UnlistenFn[] = []
  const pendingChunks: Uint8Array[] = []
  let termReady = false

  function setup(term: Terminal) {
    // Flush any buffered output that arrived before xterm was ready
    for (const chunk of pendingChunks) {
      term.write(chunk)
    }
    pendingChunks.length = 0
    termReady = true

    term.onData((data) => {
      invoke('pty_write', { tabId: tabId.value, data }).catch(() => {})
    })

    term.onResize(({ cols, rows }) => {
      invoke('pty_resize', { tabId: tabId.value, cols, rows }).catch(() => {})
    })
  }

  onMounted(async () => {
    const unlistenOutput = await listen<PtyOutput>('pty_output', (event) => {
      if (event.payload.tab_id !== tabId.value) return

      const binary = atob(event.payload.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }

      if (termReady && terminal.value) {
        terminal.value.write(bytes)
      } else {
        pendingChunks.push(bytes)
      }
    })
    unlisteners.push(unlistenOutput)

    const unlistenStatus = await listen<PtyStatus>('pty_status', (event) => {
      if (event.payload.tab_id !== tabId.value) return
      alive.value = event.payload.alive
    })
    unlisteners.push(unlistenStatus)
  })

  onBeforeUnmount(() => {
    for (const unlisten of unlisteners) {
      unlisten()
    }
    unlisteners.length = 0
    pendingChunks.length = 0
    termReady = false
  })

  return { alive, setup }
}
