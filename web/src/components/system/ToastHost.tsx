import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useToasts } from '../../lib/toast'

/**
 * Single bottom-center toast viewport (admin brief §4). Mounted once in App.
 * Toasts auto-dismiss after 3 s (handled in the store) and dismiss on click.
 */
export default function ToastHost() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-navy-900 px-4 py-3 text-white shadow-lg ring-1 ring-black/10"
          >
            {t.tone === 'success' && (
              <span
                aria-hidden
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
              >
                <Check size={13} strokeWidth={2.5} />
              </span>
            )}
            <span className="text-body font-bold">{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}
