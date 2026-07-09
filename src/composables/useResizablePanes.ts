import { ref, onMounted, onBeforeUnmount } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export function useResizablePanes(
  defaultLeftWidth: number = 280,
  minLeft: number = 200,
  minRight: number = 400,
) {
  const leftWidth = ref(defaultLeftWidth)
  const isDragging = ref(false)

  let startX = 0
  let startWidth = 0

  function onMouseDown(e: MouseEvent) {
    isDragging.value = true
    startX = e.clientX
    startWidth = leftWidth.value
    e.preventDefault()
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging.value) return
    const delta = e.clientX - startX
    const newWidth = startWidth + delta
    // Clamp between minLeft and (window width - minRight)
    const maxWidth = window.innerWidth - minRight
    leftWidth.value = Math.max(minLeft, Math.min(maxWidth, newWidth))
  }

  function onMouseUp() {
    isDragging.value = false
  }

  async function loadSizes(key: string) {
    try {
      const saved = await invoke<number | null>('load_pane_width', { key })
      if (saved !== null && saved !== undefined) {
        const maxWidth = window.innerWidth - minRight
        leftWidth.value = Math.max(minLeft, Math.min(maxWidth, saved))
      }
    } catch {
      // use default
    }
  }

  async function saveSizes(key: string) {
    try {
      await invoke('save_pane_width', { key, width: leftWidth.value })
    } catch {
      // ignore
    }
  }

  onMounted(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  })

  return { leftWidth, isDragging, onMouseDown, loadSizes, saveSizes }
}
