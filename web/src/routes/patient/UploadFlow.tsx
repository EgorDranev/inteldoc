import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, ImageIcon, Files, ArrowLeft, Check, FileText } from 'lucide-react'
import PhoneFrame from '../../components/patient/PhoneFrame'
import Button from '../../components/primitives/Button'
import BottomSheet from '../../components/primitives/BottomSheet'
import TabBar from '../../components/primitives/TabBar'
import OCRReviewPanel from '../../components/patient/OCRReviewPanel'
import CameraViewfinder from '../../components/patient/CameraViewfinder'
import QualityCheck, { type QualityIssue } from '../../components/patient/QualityCheck'
import OcrProgress from '../../components/patient/OcrProgress'
import {
  reportOcrFieldIssue,
  uploadAnalysis,
} from '../../store/actions'
import type { Analysis, AnalysisType } from '../../store/types'
import { useInteldoc } from '../../store/store'
import { BACKEND_MODE } from '../../api/config'

type Source = 'camera' | 'gallery' | 'file'
type Stage =
  | 'choose'
  | 'viewfinder'
  | 'uploading'
  | 'quality'
  | 'ocr'
  | 'review'
  | 'done'

const TYPE_LABELS: Record<AnalysisType, string> = {
  HbA1c: 'Гликированный гемоглобин (HbA1c)',
  glucose: 'Глюкоза крови натощак',
  creatinine: 'Креатинин',
  cholesterol: 'Холестерин',
  other: 'Анализ',
}

function inferTypeFromParam(param?: string): AnalysisType {
  if (!param) return 'HbA1c'
  if (['HbA1c', 'glucose', 'creatinine', 'cholesterol'].includes(param))
    return param as AnalysisType
  return 'other'
}

function parseDemoIssue(value: string | null): QualityIssue | null {
  if (!value) return null
  if (value === 'glare' || value === 'blur' || value === 'crop') return value
  if (value === 'issue' || value === '1' || value === 'true') return 'glare'
  return null
}

export default function UploadFlow() {
  const nav = useNavigate()
  const { type: typeParam } = useParams<{ type?: string }>()
  const [params] = useSearchParams()
  const planItemId = (() => {
    // Match the first 'assigned' plan item of this type, if any.
    const s = useInteldoc.getState()
    const t = inferTypeFromParam(typeParam)
    const item = s.planItems.find(
      (p) =>
        p.patientId === s.currentPatientId &&
        p.status === 'assigned' &&
        p.analysisType === t,
    )
    return item?.id
  })()

  const analysisType = inferTypeFromParam(typeParam)
  const typeLabel = TYPE_LABELS[analysisType]
  const [stage, setStage] = useState<Stage>('choose')
  const [source, setSource] = useState<Source>('camera')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [ocrReady, setOcrReady] = useState(false)
  const [ocrAnimDone, setOcrAnimDone] = useState(false)
  // Real captured document (BACKEND_MODE only). In MOCK mode the flow stays
  // simulated and this is never set.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pickedFile, setPickedFile] = useState<File | null>(null)

  // Quality check: first attempt may show a flagged issue (driven by ?demo=…),
  // any subsequent attempt always passes so the demo doesn't loop.
  const demoIssue = parseDemoIssue(params.get('demo'))
  const [attempt, setAttempt] = useState(0)
  const currentIssue: QualityIssue | null = attempt === 0 ? demoIssue : null

  // Light-weight upload spinner (only used for gallery/file paths).
  useEffect(() => {
    if (stage === 'uploading') {
      const t = setTimeout(() => setStage('quality'), 700)
      return () => clearTimeout(t)
    }
  }, [stage])

  // OCR work runs in parallel with the OcrProgress animation.
  useEffect(() => {
    if (stage !== 'ocr') return
    setOcrReady(false)
    setOcrAnimDone(false)
    let cancelled = false
    uploadAnalysis({
      type: analysisType,
      planItemId,
      file: pickedFile ?? undefined,
    }).then((a) => {
      if (!cancelled) {
        setAnalysis(a)
        setOcrReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [stage, analysisType, planItemId, pickedFile])

  // Advance to review only when both the data is ready AND the animation
  // has run its course — so the user sees the steps complete naturally.
  useEffect(() => {
    if (stage === 'ocr' && ocrReady && ocrAnimDone) {
      setStage('review')
    }
  }, [stage, ocrReady, ocrAnimDone])

  function pickSource(s: Source) {
    setSource(s)
    // BACKEND_MODE: capture a REAL document so the backend can OCR it. The native
    // picker is the capture step (camera asks for the device camera; gallery/file
    // open the library/files). MOCK mode keeps the scripted simulated flow.
    if (BACKEND_MODE) {
      const input = fileInputRef.current
      if (input) {
        if (s === 'camera') input.setAttribute('capture', 'environment')
        else input.removeAttribute('capture')
        input.value = '' // allow re-picking the same file
        input.click()
      }
      return
    }
    if (s === 'camera') setStage('viewfinder')
    else setStage('uploading')
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return // user cancelled the native dialog
    setPickedFile(f)
    setStage('quality')
  }

  function header(title: string, onBack?: () => void) {
    return (
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={onBack ?? (() => nav(-1))}
          aria-label="Назад"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-ink" strokeWidth={2} />
        </button>
        <p className="text-[15px] font-bold text-ink-strong">{title}</p>
        <div className="h-9 w-9" />
      </div>
    )
  }

  // ─── Stage: choose source ────────────────────────────────────────────────
  if (stage === 'choose') {
    const OPTIONS: Array<{
      key: Source
      title: string
      hint: string
      Icon: typeof Camera
    }> = [
      { key: 'camera', title: 'Сделать фото', hint: 'Сфотографируйте бланк', Icon: Camera },
      { key: 'gallery', title: 'Из галереи', hint: 'Выберите изображение', Icon: ImageIcon },
      { key: 'file', title: 'Выбрать файл', hint: 'PDF или фото с устройства', Icon: Files },
    ]
    return (
      <PhoneFrame>
        {header('Загрузка анализа')}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={onFilePicked}
        />
        <div className="flex-1 px-5 pt-2 pb-8 flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-caps text-cyan-500 mb-2">
              {typeLabel}
            </p>
            <h1 className="text-h1-ui font-bold text-ink-strong leading-tight">
              Как загрузить?
            </h1>
            <p className="text-caption text-ink-muted leading-relaxed mt-2">
              Василий распознаёт данные и заполнит карту анализа. Если что-то распознано неверно — отметьте, проверит специалист.
            </p>
          </div>
          <BottomSheet open onClose={() => nav(-1)} title="Как загрузить?">
            <div className="flex flex-col gap-2">
              {OPTIONS.map(({ key, title, hint, Icon }) => (
                <button
                  key={key}
                  onClick={() => pickSource(key)}
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
        </div>
      </PhoneFrame>
    )
  }

  // ─── Stage: viewfinder (camera path) ─────────────────────────────────────
  if (stage === 'viewfinder') {
    return (
      <PhoneFrame dark>
        <CameraViewfinder
          typeLabel={typeLabel}
          onCancel={() => setStage('choose')}
          onCapture={() => setStage('quality')}
        />
      </PhoneFrame>
    )
  }

  // ─── Stage: uploading (gallery/file path only) ───────────────────────────
  if (stage === 'uploading') {
    return (
      <PhoneFrame>
        {header('Загрузка анализа')}
        <div className="flex-1 px-5 flex flex-col items-center justify-center gap-5 text-center">
          <div className="w-40 h-52 rounded-2xl bg-surface-sunken border border-slate-200 flex items-center justify-center">
            <FileText size={36} className="text-cyan-500" strokeWidth={1.5} />
          </div>
          <p className="text-h2-ui font-bold text-ink-strong">Загружаем файл…</p>
          <div className="w-3/4 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <motion.div
              className="h-full bg-cyan-500"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.7, ease: 'easeInOut' }}
            />
          </div>
        </div>
      </PhoneFrame>
    )
  }

  // ─── Stage: quality check ────────────────────────────────────────────────
  if (stage === 'quality') {
    return (
      <PhoneFrame>
        {header('Проверка качества', () =>
          source === 'camera' ? setStage('viewfinder') : setStage('choose'),
        )}
        <QualityCheck
          issue={currentIssue}
          onPass={() => setStage('ocr')}
          onRetake={() => {
            setAttempt((a) => a + 1)
            if (source === 'camera') setStage('viewfinder')
            else setStage('uploading')
          }}
          onUseAnyway={() => {
            setAttempt((a) => a + 1)
            setStage('ocr')
          }}
        />
      </PhoneFrame>
    )
  }

  // ─── Stage: OCR processing ───────────────────────────────────────────────
  if (stage === 'ocr') {
    return (
      <PhoneFrame>
        {header('Распознавание')}
        <OcrProgress onComplete={() => setOcrAnimDone(true)} />
      </PhoneFrame>
    )
  }

  // ─── Stage: review ───────────────────────────────────────────────────────
  if (stage === 'review' && analysis) {
    return (
      <PhoneFrame>
        {header('Проверьте распознанные данные')}
        <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
          <div className="rounded-2xl bg-cyan-50 px-4 py-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-cyan-500 text-white flex items-center justify-center">
              <Check size={16} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[13px] font-bold text-cyan-700">
                {analysis.label}
              </p>
              <p className="text-caption text-cyan-700/80">
                Изображение чёткое · значения распознаны
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-caps text-ink-muted mb-2 px-1">
              Распознанные значения
            </p>
            <OCRReviewPanel
              analysis={analysis}
              onReportField={(field) => reportOcrFieldIssue(analysis.id, field)}
            />
            <p className="text-caption text-ink-muted leading-snug mt-2 px-1">
              Если значение распознано неверно — отметьте его. Запись проверит
              специалист, вы её не меняете.
            </p>
          </div>
        </div>
        <div className="px-5 pb-3 pt-3 bg-white/85 backdrop-blur border-t border-slate-100 mb-[89px]">
          <Button full onClick={() => setStage('done')}>
            Сохранить
          </Button>
        </div>
        <TabBar />
      </PhoneFrame>
    )
  }

  // ─── Stage: done — brief success then back to checklist ─────────────────
  if (stage === 'done') {
    return <DoneStage onContinue={() => nav('/patient/checklist', { replace: true })} />
  }

  return null
}

function DoneStage({ onContinue }: { onContinue: () => void }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 900)
    return () => clearTimeout(t)
  }, [onContinue])
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="h-20 w-20 rounded-full bg-cyan-500 flex items-center justify-center"
        >
          <Check size={40} className="text-white" strokeWidth={2.6} />
        </motion.div>
        <AnimatePresence>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-h2-ui font-bold text-ink-strong"
          >
            Сохранено
          </motion.p>
        </AnimatePresence>
      </div>
    </PhoneFrame>
  )
}
