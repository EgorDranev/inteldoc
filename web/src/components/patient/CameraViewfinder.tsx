import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Zap, Image as ImageIcon } from 'lucide-react'

interface CameraViewfinderProps {
  /** Called when a capture is taken (auto or manual). */
  onCapture: () => void
  /** Called when the user cancels the camera. */
  onCancel: () => void
  /** Label of the analysis being captured, e.g. "Гликированный гемоглобин (HbA1c)". */
  typeLabel: string
  /** Auto-capture delay after the document is "detected", in ms. */
  autoCaptureMs?: number
}

/**
 * Mocked phone camera viewfinder for capturing an analysis form.
 *
 * Stages internally:
 *  - searching: corner brackets sweep, hint reads "Поднесите бланк..."
 *  - detected: brackets snap to the document, ring countdown begins
 *  - capturing: full-frame white flash, then onCapture()
 */
export default function CameraViewfinder({
  onCapture,
  onCancel,
  typeLabel,
  autoCaptureMs = 1400,
}: CameraViewfinderProps) {
  const [phase, setPhase] = useState<'searching' | 'detected' | 'capturing'>('searching')
  const fired = useRef(false)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('detected'), 1200)
    return () => clearTimeout(t1)
  }, [])

  useEffect(() => {
    if (phase !== 'detected') return
    const t = setTimeout(() => triggerCapture(), autoCaptureMs)
    return () => clearTimeout(t)
  }, [phase, autoCaptureMs])

  function triggerCapture() {
    if (fired.current) return
    fired.current = true
    setPhase('capturing')
    setTimeout(onCapture, 320)
  }

  const hint =
    phase === 'searching'
      ? 'Поднесите бланк целиком в рамку'
      : phase === 'detected'
      ? 'Бланк найден. Снимаю…'
      : 'Снято'

  return (
    <div className="relative flex-1 flex flex-col bg-black text-white overflow-hidden">
      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={onCancel}
          aria-label="Отменить"
          className="h-9 w-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center"
        >
          <X size={20} strokeWidth={2.2} />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-caps text-white/60">
            Камера
          </p>
          <p className="text-[13px] font-semibold text-white/90 leading-tight max-w-[220px] truncate">
            {typeLabel}
          </p>
        </div>
        <button
          aria-label="Вспышка"
          className="h-9 w-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center"
        >
          <Zap size={18} strokeWidth={2.2} />
        </button>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 flex items-center justify-center px-5">
        {/* Mock document silhouette */}
        <motion.div
          initial={{ rotate: -3, opacity: 0.85 }}
          animate={{
            rotate: phase === 'searching' ? [-3, -1.5, -3] : 0,
            opacity: phase === 'capturing' ? 0 : 1,
          }}
          transition={{
            rotate:
              phase === 'searching'
                ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 0.2 },
          }}
          className="relative w-[78%] aspect-[3/4] rounded-md bg-[#F5EFE3] shadow-[0_30px_60px_rgba(0,0,0,0.55)] overflow-hidden"
        >
          <MockFormPaper />
        </motion.div>

        {/* Corner brackets */}
        <CornerFrame phase={phase} />

        {/* Capture flash */}
        {phase === 'capturing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.32, times: [0, 0.4, 1] }}
            className="absolute inset-0 bg-white pointer-events-none"
          />
        )}
      </div>

      {/* Hint */}
      <div className="relative z-20 px-5 pb-4 flex justify-center">
        <motion.div
          key={hint}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="px-4 py-2 rounded-full bg-black/55 backdrop-blur text-[13px] font-medium text-white/95"
        >
          {hint}
        </motion.div>
      </div>

      {/* Shutter row */}
      <div className="relative z-20 flex items-center justify-between px-8 pb-8 pt-2">
        <button
          aria-label="Из галереи"
          onClick={onCancel}
          className="h-11 w-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center"
        >
          <ImageIcon size={20} strokeWidth={2} />
        </button>

        <button
          onClick={triggerCapture}
          aria-label="Сделать снимок"
          className="relative h-[72px] w-[72px] rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform"
        >
          <span className="absolute inset-1.5 rounded-full border-[3px] border-black" />
          {phase === 'detected' && (
            <motion.span
              aria-hidden
              className="absolute -inset-1 rounded-full border-[3px] border-cyan-500"
              initial={{ pathLength: 0, opacity: 0.9 }}
              animate={{ rotate: 360 }}
              transition={{ duration: autoCaptureMs / 1000, ease: 'linear' }}
              style={{ borderTopColor: 'transparent' }}
            />
          )}
        </button>

        <div className="h-11 w-11" />
      </div>
    </div>
  )
}

/**
 * Decorative paper content — simulates a lab form layout so the viewfinder
 * has something believable to "scan".
 */
function MockFormPaper() {
  return (
    <div className="absolute inset-0 p-4 flex flex-col gap-2 text-[#1F2937]">
      <div className="flex items-center justify-between">
        <div className="h-2 w-16 rounded-sm bg-[#1F2937]/80" />
        <div className="h-2 w-10 rounded-sm bg-[#1F2937]/40" />
      </div>
      <div className="h-1.5 w-3/5 rounded-sm bg-[#1F2937]/30" />
      <div className="mt-3 flex flex-col gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-sm bg-[#1F2937]/25" />
            <div className="h-1.5 w-8 rounded-sm bg-[#1F2937]/55" />
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-2">
        <div className="h-2 w-12 rounded-sm bg-[#1F2937]/40" />
        <div className="h-2 w-8 rounded-sm bg-[#1F2937]/25" />
      </div>
    </div>
  )
}

interface CornerFrameProps {
  phase: 'searching' | 'detected' | 'capturing'
}

/**
 * Four animated corner brackets. They breathe while searching, snap inward
 * when the document is "detected", and turn cyan to confirm.
 */
function CornerFrame({ phase }: CornerFrameProps) {
  const color = phase === 'detected' || phase === 'capturing' ? '#2563EB' : 'rgba(255,255,255,0.85)'
  const inset = phase === 'searching' ? '8%' : '11%'
  return (
    <motion.div
      className="absolute pointer-events-none"
      animate={{ top: inset, bottom: inset, left: inset, right: inset }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
        <Corner key={corner} corner={corner} color={color} />
      ))}
    </motion.div>
  )
}

function Corner({ corner, color }: { corner: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const pos: Record<typeof corner, string> = {
    tl: 'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md',
    tr: 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md',
    bl: 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md',
    br: 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md',
  }
  return (
    <span
      className={`absolute h-7 w-7 ${pos[corner]}`}
      style={{ borderColor: color, transition: 'border-color 240ms ease' }}
    />
  )
}
