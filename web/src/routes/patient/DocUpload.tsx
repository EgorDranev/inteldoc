import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Camera,
  Files,
  ImageIcon,
  Check,
  FileText,
  Move,
  SunDim,
  Sparkles,
  CheckCircle2,
  Plus,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import BottomSheet from '../../components/primitives/BottomSheet'
import TabBar from '../../components/primitives/TabBar'
import { uploadDocument } from '../../store/actions'
import type { DocumentType } from '../../store/types'

const DOC_LABELS: Record<DocumentType, string> = {
  passport: 'Паспорт',
  oms: 'Полис ОМС',
  snils: 'СНИЛС',
  referral: 'Направление',
  other: 'Документ',
}

type FrameOrientation = 'landscape' | 'portrait'

const FRAME_GEOMETRY: Record<DocumentType, { aspect: number; orientation: FrameOrientation }> = {
  passport: { aspect: 1.4, orientation: 'landscape' },
  oms: { aspect: 1.6, orientation: 'landscape' },
  snils: { aspect: 1.6, orientation: 'landscape' },
  referral: { aspect: 0.71, orientation: 'portrait' },
  other: { aspect: 0.71, orientation: 'portrait' },
}

const PAGE_PRESETS: Record<DocumentType, string[]> = {
  passport: ['Разворот с фото', 'Страница с пропиской'],
  oms: ['Лицевая сторона', 'Обратная сторона'],
  snils: ['Лицевая сторона', 'Обратная сторона'],
  referral: [],
  other: [],
}

function pageLabelFor(type: DocumentType, index: number): string {
  const preset = PAGE_PRESETS[type]
  if (index < preset.length) return preset[index]
  return `Страница ${index + 1}`
}

type SourceKind = 'camera' | 'gallery' | 'file'
type Stage = 'choose' | 'capture' | 'review' | 'uploading' | 'quality' | 'done'

interface CapturedPage {
  id: string
  source: SourceKind
  label: string
}

type QualityIssue = 'misaligned' | 'dark' | 'glare' | null

const ISSUE_COPY: Record<Exclude<QualityIssue, null>, { text: string; Icon: typeof Move }> = {
  misaligned: { text: 'Поместите документ в рамку', Icon: Move },
  dark: { text: 'Недостаточно света', Icon: SunDim },
  glare: { text: 'Уберите блик', Icon: Sparkles },
}

let _pageSeq = 1
function nextPageId(): string {
  return `pg-${Date.now().toString(36)}-${(_pageSeq++).toString(36)}`
}

export default function DocUpload() {
  const nav = useNavigate()
  const { type: typeParam } = useParams<{ type?: string }>()
  const docType = ((): DocumentType => {
    if (typeParam && typeParam in DOC_LABELS) return typeParam as DocumentType
    return 'other'
  })()

  const [stage, setStage] = useState<Stage>('choose')
  const [pages, setPages] = useState<CapturedPage[]>([])
  const [sourceSheetOpen, setSourceSheetOpen] = useState(true)
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null)

  // Persist final upload + auto-advance through closing stages.
  useEffect(() => {
    if (stage === 'uploading') {
      const t = setTimeout(() => setStage('quality'), 900)
      return () => clearTimeout(t)
    }
    if (stage === 'quality') {
      uploadDocument({ type: docType, label: DOC_LABELS[docType] })
      const t = setTimeout(() => setStage('done'), 750)
      return () => clearTimeout(t)
    }
    if (stage === 'done') {
      const t = setTimeout(() => nav('/patient/checklist', { replace: true }), 700)
      return () => clearTimeout(t)
    }
  }, [stage, docType, nav])

  function handleSourcePicked(source: SourceKind) {
    setSourceSheetOpen(false)
    if (source === 'camera') {
      setStage('capture')
      return
    }
    // Gallery / file: simulate that one page was picked, then go to review.
    const newPage: CapturedPage = {
      id: nextPageId(),
      source,
      label: pageLabelFor(docType, pages.length),
    }
    if (retakeIndex !== null) {
      setPages((prev) => prev.map((p, i) => (i === retakeIndex ? { ...newPage, label: prev[i].label } : p)))
      setRetakeIndex(null)
    } else {
      setPages((prev) => [...prev, newPage])
    }
    setStage('review')
  }

  function handleCapturePage() {
    const newPage: CapturedPage = {
      id: nextPageId(),
      source: 'camera',
      label: pageLabelFor(docType, pages.length),
    }
    if (retakeIndex !== null) {
      setPages((prev) => prev.map((p, i) => (i === retakeIndex ? { ...newPage, label: prev[i].label } : p)))
      setRetakeIndex(null)
      setStage('review')
    } else {
      setPages((prev) => [...prev, newPage])
    }
  }

  function handleDoneCapturing() {
    setStage('review')
  }

  function handleAddMore() {
    setRetakeIndex(null)
    setSourceSheetOpen(true)
  }

  function handleRetake(index: number) {
    setRetakeIndex(index)
    setSourceSheetOpen(true)
  }

  function handleDeletePage(index: number) {
    setPages((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit() {
    setStage('uploading')
  }

  function handleBack() {
    if (stage === 'capture') {
      if (pages.length > 0) setStage('review')
      else nav(-1)
      return
    }
    if (stage === 'review') {
      // Going back from review = abandon and return to caller.
      nav(-1)
      return
    }
    nav(-1)
  }

  function header(title: string, subtitle?: string) {
    return (
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={handleBack}
          aria-label="Назад"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-ink" strokeWidth={2} />
        </button>
        <div className="flex flex-col items-center">
          <p className="text-[15px] font-bold text-ink-strong leading-tight">{title}</p>
          {subtitle && (
            <p className="text-[11px] text-ink-muted leading-tight mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="h-9 w-9" />
      </div>
    )
  }

  // ─── Stage: choose ────────────────────────────────────────────────────────
  if (stage === 'choose') {
    return (
      <PhoneFrame>
        {header('Загрузка документа')}
        <div className="flex-1 px-5 pt-2 pb-8 flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500 mb-2">
              {DOC_LABELS[docType].toUpperCase()}
            </p>
            <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
              Как загрузить?
            </h1>
            <p className="text-caption text-ink-muted leading-relaxed mt-2">
              Документ сохраним в зашифрованном виде. Доступен будет только клинике, которой вы выдали доступ.
            </p>
          </div>
          <SourceSheet
            open={sourceSheetOpen}
            onClose={() => nav(-1)}
            onPick={handleSourcePicked}
          />
        </div>
      </PhoneFrame>
    )
  }

  // ─── Stage: capture (camera + frame guide + quality hints) ────────────────
  if (stage === 'capture') {
    const captureLabel = retakeIndex !== null
      ? pages[retakeIndex]?.label ?? pageLabelFor(docType, retakeIndex)
      : pageLabelFor(docType, pages.length)
    const captureCounter = retakeIndex !== null
      ? `Переснять · ${pages[retakeIndex]?.label}`
      : `Стр. ${pages.length + 1}${pages.length > 0 ? ' · добавить' : ''}`
    return (
      <PhoneFrame>
        {header(DOC_LABELS[docType], captureCounter)}
        <CaptureView
          docType={docType}
          captureLabel={captureLabel}
          pageCount={pages.length}
          retakeMode={retakeIndex !== null}
          onShutter={handleCapturePage}
          onDone={handleDoneCapturing}
          onCancelRetake={() => {
            setRetakeIndex(null)
            setStage('review')
          }}
        />
      </PhoneFrame>
    )
  }

  // ─── Stage: review (multi-page list) ───────────────────────────────────────
  if (stage === 'review') {
    return (
      <PhoneFrame>
        {header('Загрузка документа', `${DOC_LABELS[docType]} · ${pages.length} стр.`)}
        <div className="flex-1 px-5 pt-2 pb-[200px] overflow-y-auto flex flex-col gap-4">
          <div>
            <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
              Проверьте страницы
            </h1>
            <p className="text-caption text-ink-muted leading-relaxed mt-2">
              Переснимите неудачные кадры или добавьте недостающие страницы. Порядок сохранится.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {pages.map((page, index) => (
              <PageRow
                key={page.id}
                index={index}
                page={page}
                docType={docType}
                onRetake={() => handleRetake(index)}
                onDelete={() => handleDeletePage(index)}
              />
            ))}
            <button
              onClick={handleAddMore}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-[14px] font-semibold text-cyan-600 hover:border-cyan-400 hover:bg-cyan-50/40 transition-colors"
            >
              <Plus size={18} strokeWidth={2.4} />
              Добавить страницу
            </button>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-[89px] px-5 pb-3 pt-3 bg-gradient-to-t from-page-bg via-page-bg to-transparent">
          <button
            onClick={handleSubmit}
            disabled={pages.length === 0}
            className="w-full rounded-2xl bg-cyan-500 px-4 py-4 text-[16px] font-bold text-white shadow-[0_8px_24px_rgba(8,145,178,0.25)] hover:bg-cyan-600 transition-colors disabled:bg-slate-300 disabled:shadow-none"
          >
            {pages.length > 0
              ? `Загрузить · ${pages.length} ${pluralStr(pages.length)}`
              : 'Загрузить'}
          </button>
        </div>
        <SourceSheet
          open={sourceSheetOpen}
          onClose={() => {
            setSourceSheetOpen(false)
            setRetakeIndex(null)
          }}
          onPick={handleSourcePicked}
          retakeMode={retakeIndex !== null}
        />
        <TabBar />
      </PhoneFrame>
    )
  }

  // ─── Stage: uploading ──────────────────────────────────────────────────────
  if (stage === 'uploading') {
    return (
      <PhoneFrame>
        {header('Загрузка документа')}
        <div className="flex-1 px-5 flex flex-col items-center justify-center gap-5 text-center">
          <div className="w-40 h-52 rounded-2xl bg-surface-sunken border border-slate-200 flex items-center justify-center">
            <FileText size={36} className="text-cyan-500" strokeWidth={1.5} />
          </div>
          <p className="text-h2-ui font-bold text-ink-strong">
            {pages.length > 1 ? `Загружаем ${pages.length} страниц…` : 'Загружаем файл…'}
          </p>
          <div className="w-3/4 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <motion.div
              className="h-full bg-cyan-500"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            />
          </div>
        </div>
      </PhoneFrame>
    )
  }

  // ─── Stage: quality ────────────────────────────────────────────────────────
  if (stage === 'quality') {
    return (
      <PhoneFrame>
        {header('Загрузка документа')}
        <div className="flex-1 px-5 flex flex-col items-center justify-center gap-5 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="h-20 w-20 rounded-full bg-success-bg flex items-center justify-center"
          >
            <Check size={40} className="text-emerald-600" strokeWidth={2.5} />
          </motion.div>
          <p className="text-h2-ui font-bold text-ink-strong">
            {pages.length > 1 ? 'Все страницы чёткие' : 'Изображение чёткое'}
          </p>
        </div>
      </PhoneFrame>
    )
  }

  // ─── Stage: done ───────────────────────────────────────────────────────────
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="h-20 w-20 rounded-full bg-cyan-500 flex items-center justify-center"
        >
          <Check size={40} className="text-white" strokeWidth={2.6} />
        </motion.div>
        <p className="text-h2-ui font-bold text-ink-strong">Сохранено</p>
      </div>
    </PhoneFrame>
  )
}

function pluralStr(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'страница'
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'страницы'
  return 'страниц'
}

// ───────────────────────────────────────────────────────────────────────────
// Source picker bottom sheet
// ───────────────────────────────────────────────────────────────────────────

interface SourceSheetProps {
  open: boolean
  onClose: () => void
  onPick: (source: SourceKind) => void
  retakeMode?: boolean
}

function SourceSheet({ open, onClose, onPick, retakeMode = false }: SourceSheetProps) {
  const OPTIONS: Array<{ key: SourceKind; title: string; hint: string; Icon: typeof Camera }> = [
    { key: 'camera', title: 'Сделать фото', hint: 'С подсказками и рамкой', Icon: Camera },
    { key: 'gallery', title: 'Из галереи', hint: 'Выберите изображение', Icon: ImageIcon },
    { key: 'file', title: 'Выбрать файл', hint: 'PDF или фото', Icon: Files },
  ]
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={retakeMode ? 'Переснять страницу' : 'Как загрузить?'}
    >
      <div className="flex flex-col gap-2">
        {OPTIONS.map(({ key, title, hint, Icon }) => (
          <button
            key={key}
            onClick={() => onPick(key)}
            className="flex items-center gap-4 rounded-2xl bg-surface-sunken px-4 py-4 text-left hover:bg-cyan-50 transition-colors"
          >
            <div className="h-11 w-11 rounded-xl bg-cyan-500 text-white flex items-center justify-center">
              <Icon size={22} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-ink-strong">{title}</p>
              <p className="text-caption text-ink-muted">{hint}</p>
            </div>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Capture view: viewfinder + frame guide + quality hints + shutter
// ───────────────────────────────────────────────────────────────────────────

interface CaptureViewProps {
  docType: DocumentType
  captureLabel: string
  pageCount: number
  retakeMode: boolean
  onShutter: () => void
  onDone: () => void
  onCancelRetake: () => void
}

function CaptureView({
  docType,
  captureLabel,
  pageCount,
  retakeMode,
  onShutter,
  onDone,
  onCancelRetake,
}: CaptureViewProps) {
  const geometry = FRAME_GEOMETRY[docType]
  const [issue, setIssue] = useState<QualityIssue>('misaligned')
  const [flashing, setFlashing] = useState(false)
  const firstPageRef = useRef(pageCount === 0 && !retakeMode)

  // Quality-hint state machine. On the first page we run the full tutorial
  // sequence so the user sees the feature; on later pages the system reaches
  // ready quickly so the demo doesn't feel sluggish.
  useEffect(() => {
    let mounted = true
    const sequence = firstPageRef.current
      ? ([
          { state: 'misaligned' as QualityIssue, hold: 1100 },
          { state: 'dark' as QualityIssue, hold: 950 },
          { state: 'glare' as QualityIssue, hold: 950 },
          { state: null as QualityIssue, hold: 0 },
        ])
      : ([
          { state: 'misaligned' as QualityIssue, hold: 600 },
          { state: null as QualityIssue, hold: 0 },
        ])

    let i = 0
    function step() {
      if (!mounted) return
      const cur = sequence[i]
      setIssue(cur.state)
      if (i < sequence.length - 1) {
        const t = setTimeout(() => {
          i += 1
          step()
        }, cur.hold)
        timers.push(t)
      }
    }
    const timers: ReturnType<typeof setTimeout>[] = []
    step()
    firstPageRef.current = false
    return () => {
      mounted = false
      timers.forEach(clearTimeout)
    }
  // We deliberately re-run only when the page is captured (pageCount changes),
  // not when issue updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount, retakeMode])

  const ready = issue === null

  function fire() {
    if (!ready || flashing) return
    setFlashing(true)
    setTimeout(() => {
      setFlashing(false)
      onShutter()
    }, 180)
  }

  // Frame size — fit within ~280×360 viewfinder area.
  const frameWidth = geometry.orientation === 'landscape' ? 280 : Math.round(280 * geometry.aspect)
  const frameHeight = geometry.orientation === 'landscape'
    ? Math.round(280 / geometry.aspect)
    : 360

  return (
    <div className="relative flex-1 flex flex-col bg-slate-950 overflow-hidden">
      {/* Viewfinder backdrop — radial gradient hints at a "live preview" */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 40%, #1f2937 0%, #0b1220 60%, #050810 100%)',
        }}
      />

      {/* Faint mock document inside frame, drifts when not aligned */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          animate={
            ready
              ? { x: 0, y: 0, rotate: 0, opacity: 0.92 }
              : { x: -14, y: 8, rotate: -2.2, opacity: 0.55 }
          }
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
          style={{ width: frameWidth - 16, height: frameHeight - 16 }}
          className="rounded-[10px] bg-slate-100/85 shadow-[0_10px_30px_rgba(0,0,0,0.35)] flex flex-col gap-2 p-4"
        >
          <div className="h-2.5 w-1/2 rounded-full bg-slate-400/70" />
          <div className="h-1.5 w-3/4 rounded-full bg-slate-300/80" />
          <div className="h-1.5 w-2/3 rounded-full bg-slate-300/80" />
          <div className="mt-auto flex items-end gap-3">
            <div className="h-12 w-9 rounded-md bg-slate-300/80" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-1.5 w-full rounded-full bg-slate-300/80" />
              <div className="h-1.5 w-5/6 rounded-full bg-slate-300/80" />
              <div className="h-1.5 w-2/3 rounded-full bg-slate-300/80" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Frame guide with corner markers */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="relative"
          style={{ width: frameWidth, height: frameHeight }}
        >
          <motion.div
            animate={{ opacity: ready ? 1 : 0.7 }}
            className={`absolute inset-0 rounded-[12px] border ${
              ready ? 'border-cyan-400/80' : 'border-white/35 border-dashed'
            }`}
          />
          <CornerMarker pos="tl" ready={ready} />
          <CornerMarker pos="tr" ready={ready} />
          <CornerMarker pos="bl" ready={ready} />
          <CornerMarker pos="br" ready={ready} />
        </div>
      </div>

      {/* Quality hint pill */}
      <div className="relative z-10 pt-4 px-5 flex justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={issue ?? 'ready'}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold backdrop-blur-md ${
              ready
                ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-300/50'
                : 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-300/50'
            }`}
          >
            {ready ? (
              <>
                <CheckCircle2 size={14} strokeWidth={2.4} />
                Готово — нажмите для съёмки
              </>
            ) : (
              (() => {
                const { text, Icon } = ISSUE_COPY[issue!]
                return (
                  <>
                    <Icon size={14} strokeWidth={2.4} />
                    {text}
                  </>
                )
              })()
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Frame label inside viewfinder */}
      <div className="relative z-10 mt-auto pb-4 flex justify-center">
        <p className="text-[11px] font-semibold uppercase tracking-caps text-white/70 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
          {captureLabel}
        </p>
      </div>

      {/* Shutter flash */}
      <AnimatePresence>
        {flashing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-20 bg-white pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Bottom controls */}
      <div className="relative z-10 px-5 pt-2 pb-6 bg-black/35 backdrop-blur-sm flex items-center justify-between">
        <div className="w-20 flex flex-col items-start">
          {pageCount > 0 ? (
            <>
              <p className="text-[12px] font-semibold text-white/85">{pageCount} стр.</p>
              <p className="text-[10px] text-white/60 leading-tight mt-0.5">в очереди</p>
            </>
          ) : (
            <p className="text-[10px] text-white/50">Снимите первую страницу</p>
          )}
        </div>

        <button
          onClick={fire}
          disabled={!ready}
          aria-label="Сделать снимок"
          className={`relative h-[68px] w-[68px] rounded-full transition-transform active:scale-95 ${
            ready ? '' : 'opacity-50'
          }`}
        >
          <span
            className={`absolute inset-0 rounded-full ring-4 ${
              ready ? 'ring-white' : 'ring-white/50'
            }`}
          />
          <span
            className={`absolute inset-1.5 rounded-full ${
              ready ? 'bg-white' : 'bg-white/60'
            }`}
          />
        </button>

        <div className="w-20 flex justify-end">
          {retakeMode ? (
            <button
              onClick={onCancelRetake}
              className="text-[13px] font-semibold text-white/85 hover:text-white"
            >
              Отмена
            </button>
          ) : (
            <button
              onClick={onDone}
              disabled={pageCount === 0}
              className="text-[13px] font-semibold text-cyan-400 hover:text-cyan-300 disabled:text-white/35"
            >
              Готово
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CornerMarker({ pos, ready }: { pos: 'tl' | 'tr' | 'bl' | 'br'; ready: boolean }) {
  const base = 'absolute h-5 w-5 transition-colors'
  const color = ready ? 'border-cyan-400' : 'border-white/85'
  const map: Record<typeof pos, string> = {
    tl: '-top-[2px] -left-[2px] border-t-[3px] border-l-[3px] rounded-tl-[10px]',
    tr: '-top-[2px] -right-[2px] border-t-[3px] border-r-[3px] rounded-tr-[10px]',
    bl: '-bottom-[2px] -left-[2px] border-b-[3px] border-l-[3px] rounded-bl-[10px]',
    br: '-bottom-[2px] -right-[2px] border-b-[3px] border-r-[3px] rounded-br-[10px]',
  }
  return <div className={`${base} ${color} ${map[pos]}`} />
}

// ───────────────────────────────────────────────────────────────────────────
// Page row in review
// ───────────────────────────────────────────────────────────────────────────

interface PageRowProps {
  index: number
  page: CapturedPage
  docType: DocumentType
  onRetake: () => void
  onDelete: () => void
}

function PageRow({ index, page, docType, onRetake, onDelete }: PageRowProps) {
  const sourceLabel: Record<SourceKind, string> = {
    camera: 'Камера',
    gallery: 'Галерея',
    file: 'Файл',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-stretch gap-3 rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-slate-100"
    >
      <PageThumbnail docType={docType} index={index} />
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="text-[14px] font-semibold text-ink-strong leading-tight truncate">
          {page.label}
        </p>
        <p className="text-[12px] text-ink-muted mt-0.5">
          {sourceLabel[page.source]} · чёткое
        </p>
      </div>
      <div className="flex flex-col gap-1.5 justify-center">
        <button
          onClick={onRetake}
          aria-label="Переснять"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-ink transition-colors"
        >
          <RotateCcw size={16} strokeWidth={2} />
        </button>
        <button
          onClick={onDelete}
          aria-label="Удалить страницу"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-rose-50 hover:text-rose-500 transition-colors"
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
      </div>
    </motion.div>
  )
}

function PageThumbnail({ docType, index }: { docType: DocumentType; index: number }) {
  const geometry = FRAME_GEOMETRY[docType]
  const w = geometry.orientation === 'landscape' ? 72 : 56
  const h = geometry.orientation === 'landscape' ? 52 : 72
  return (
    <div
      className="relative flex-shrink-0 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex flex-col gap-1 p-1.5"
      style={{ width: w, height: h }}
    >
      <div className="h-1 w-1/2 rounded-full bg-slate-300" />
      <div className="h-1 w-3/4 rounded-full bg-slate-300/80" />
      <div className="h-1 w-2/3 rounded-full bg-slate-300/80" />
      <div className="absolute bottom-1 right-1 text-[9px] font-bold text-slate-400">
        {index + 1}
      </div>
    </div>
  )
}
