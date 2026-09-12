/**
 * usePopover — posisi dan siklus hidup layer pop-up yang seragam di seluruh situs
 *
 * Spesifikasi perilaku (semua dropdown/menu dipaksa konsisten):
 * - Posisi: fixed + getBoundingClientRect, horizontal disejajarkan berdasarkan placement dan diklemkan ke viewport,
 *   ketika ruang di bawah tidak cukup dan di atas lebih besar, dibalik ke atas
 * - Gulir (kecuali panel sendiri) / resize → tutup
 * - Escape → tutup dan kembalikan fokus ke pemicu
 * - pointerdown outside → tutup (klik tetap berlalu, tidak menggunakan elemen backdrop:
 *   backdrop akan menutupi pemicu sehingga tidak bisa menutup dengan menekan pemicu, dan perlu memelihara pasangan z-index)
 */
import { ref, watch, nextTick, onBeforeUnmount, type CSSProperties, type Ref } from 'vue'

export interface PopoverOptions {
  placement?: 'bottom-start' | 'bottom-end' | 'bottom'
  offset?: number
  matchWidth?: boolean
  minWidth?: number
  maxHeight?: number
  viewportMargin?: number
}

export interface PopoverReturn {
  isOpen: Ref<boolean>
  anchorEl: Ref<HTMLElement | null>
  panelEl: Ref<HTMLElement | null>
  panelStyle: Ref<CSSProperties>
  placement: Ref<'bottom' | 'top'>
  open: () => void
  close: () => void
  toggle: () => void
}

export function usePopover(opts: PopoverOptions = {}): PopoverReturn {
  const isOpen = ref(false)
  const anchorEl = ref<HTMLElement | null>(null)
  const panelEl = ref<HTMLElement | null>(null)
  const panelStyle = ref<CSSProperties>({})
  const placement = ref<'bottom' | 'top'>('bottom')

  const offset = opts.offset ?? 6
  const margin = opts.viewportMargin ?? 12
  const minWidth = opts.minWidth ?? 160
  const maxHeight = opts.maxHeight ?? 320

  async function position() {
    const rect = anchorEl.value?.getBoundingClientRect()
    if (!rect) return
    const width = opts.matchWidth ? rect.width : Math.max(minWidth, rect.width)

    let left = rect.left
    if (opts.placement === 'bottom-end') left = rect.right - width
    else if (opts.placement === 'bottom') left = rect.left + rect.width / 2 - width / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))

    placement.value = 'bottom'
    panelStyle.value = {
      position: 'fixed',
      top: `${rect.bottom + offset}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
    }

    // Setelah panel di-render, ukur tinggi sebenarnya, jika tidak cukup di bawah dan di atas lebih besar, balik
    await nextTick()
    const h = panelEl.value?.offsetHeight ?? 0
    const below = window.innerHeight - rect.bottom - margin
    const above = rect.top - margin
    if (below < Math.min(h, 240) && above > below) {
      placement.value = 'top'
      panelStyle.value = {
        ...panelStyle.value,
        top: `${Math.max(margin, rect.top - h - offset)}px`,
      }
    }
  }

  function onScroll(e: Event) {
    if (panelEl.value && e.target instanceof Node && panelEl.value.contains(e.target)) return
    close()
  }
  function onResize() { close() }
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    close()
    anchorEl.value?.focus?.()
  }
  function onPointerDown(e: PointerEvent) {
    const t = e.target as Node
    if (anchorEl.value?.contains(t) || panelEl.value?.contains(t)) return
    close()
  }

  function detachListeners() {
    document.removeEventListener('scroll', onScroll, true)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', onResize)
  }

  watch(isOpen, async (v) => {
    if (v) {
      await position()
      document.addEventListener('scroll', onScroll, true)
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeydown)
      window.addEventListener('resize', onResize)
    } else {
      detachListeners()
    }
  })
  onBeforeUnmount(detachListeners)

  function open() { isOpen.value = true }
  function close() { isOpen.value = false }
  function toggle() { isOpen.value ? close() : open() }

  return { isOpen, anchorEl, panelEl, panelStyle, placement, open, close, toggle }
}
