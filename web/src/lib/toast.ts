import { create } from 'zustand'

export type ToastTone = 'default' | 'success'

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

interface ToastStore {
  toasts: ToastItem[]
  push: (message: string, tone?: ToastTone) => void
  dismiss: (id: string) => void
}

let seq = 0

/**
 * Bottom-center toast store (admin brief §4 — auto-dismiss after 3 s, manual
 * dismiss on click). Kept outside the domain store so any surface — or plain
 * action code — can fire a toast without prop drilling. Render once via
 * <ToastHost/> in App.
 */
export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, tone = 'default') => {
    const id = `toast-${++seq}`
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3000)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Fire a toast from anywhere (components or action helpers). */
export function toast(message: string, tone: ToastTone = 'default'): void {
  useToasts.getState().push(message, tone)
}
