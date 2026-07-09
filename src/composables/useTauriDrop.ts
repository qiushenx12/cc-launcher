import { onMounted, onBeforeUnmount } from 'vue'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

export interface DropPosition {
  x: number
  y: number
}

export interface DropOptions {
  onOver?: (position: DropPosition) => void
  onLeave?: () => void
}

function toLogical(position: { x: number; y: number }): DropPosition {
  const scale = window.devicePixelRatio || 1
  return { x: position.x / scale, y: position.y / scale }
}

export function useTauriDrop(
  callback: (paths: string[], position: DropPosition) => void,
  options?: DropOptions,
) {
  let unlisten: (() => void) | null = null

  onMounted(async () => {
    const win = getCurrentWebviewWindow()
    unlisten = await win.onDragDropEvent((event) => {
      const payload = event.payload
      if (payload.type === 'drop' && payload.paths.length > 0) {
        callback(payload.paths, toLogical(payload.position))
        return
      }
      if (payload.type === 'over') {
        options?.onOver?.(toLogical(payload.position))
        return
      }
      if (payload.type === 'leave') {
        options?.onLeave?.()
      }
    })
  })

  onBeforeUnmount(() => {
    unlisten?.()
  })
}

export function isInside(
  position: DropPosition,
  element: HTMLElement | null,
): boolean {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return (
    position.x >= rect.left
    && position.x <= rect.right
    && position.y >= rect.top
    && position.y <= rect.bottom
  )
}
