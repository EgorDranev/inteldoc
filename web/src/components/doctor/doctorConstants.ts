// Mock-only catalogues used by the doctor cockpit.
// These live on the doctor surface (not the frozen store) per contract:
// - additional specialists shown in the «Какие ещё врачи» block (spec 19/20)
// - document slot taxonomy used to render the readiness checklist (spec 11/13/14/15)
// - readable Russian labels for plan-item statuses, analysis types, document types

import type { AnalysisType, DocumentType, PlanItemStatus } from '../../store/types'

export interface SpecialistOption {
  id: string
  specialty: string
  reason: string
  /** Mocked recommended slot label for the doctor view (no real booking). */
  slotHint?: string
}

/**
 * Catalogue of additional specialists a доктор may suggest as part of
 * preparation. Static, partner-curated, non-AI-inferred.
 */
export const SPECIALIST_OPTIONS: SpecialistOption[] = [
  {
    id: 'oph',
    specialty: 'Офтальмолог',
    reason: 'Осмотр глазного дна перед основным приёмом',
    slotHint: '5 мая, 11:00',
  },
  {
    id: 'card',
    specialty: 'Кардиолог',
    reason: 'Сопутствующая оценка сердечно-сосудистой системы',
    slotHint: '6 мая, 09:30',
  },
  {
    id: 'neph',
    specialty: 'Нефролог',
    reason: 'Дополнительный контроль функции почек',
    slotHint: '7 мая, 14:00',
  },
  {
    id: 'neuro',
    specialty: 'Невролог',
    reason: 'Скрининг сенсорной чувствительности',
    slotHint: '8 мая, 10:00',
  },
]

export interface DocumentSlot {
  type: DocumentType
  label: string
  /** Required = counts toward readiness; optional = surfaced but not required. */
  required: boolean
  /** Spec id this slot maps to, for traceability. */
  specRef: string
  helper?: string
}

/**
 * Doctor-side document checklist taxonomy. Mirrors the patient surface but
 * also surfaces the OMS (14) and external-LPU referral (15) slots explicitly.
 */
export const DOCUMENT_SLOTS: DocumentSlot[] = [
  {
    type: 'passport',
    label: 'Паспорт',
    required: true,
    specRef: '11/13',
    helper: 'Идентификация пациента',
  },
  {
    type: 'oms',
    label: 'Полис ОМС',
    required: true,
    specRef: '14',
    helper: 'Оригинал хранится у пациента, в IntelDoc — копия',
  },
  {
    type: 'snils',
    label: 'СНИЛС',
    required: false,
    specRef: '11',
    helper: 'Опционально для пилотного приёма',
  },
  {
    type: 'referral',
    label: 'Направление от другого ЛПУ',
    required: false,
    specRef: '15',
    helper: 'Если приём — продолжение наблюдения',
  },
  {
    type: 'other',
    label: 'Другие документы',
    required: false,
    specRef: '11',
    helper: 'Выписки, заключения и пр.',
  },
]

export const ANALYSIS_TYPE_LABEL: Record<AnalysisType, string> = {
  HbA1c: 'Гликированный гемоглобин (HbA1c)',
  glucose: 'Глюкоза крови натощак',
  creatinine: 'Креатинин',
  cholesterol: 'Холестерин',
  other: 'Другой анализ',
}

export const PLAN_STATUS_LABEL: Record<PlanItemStatus, string> = {
  assigned: 'Ждём пациента',
  uploaded: 'Загружено',
  acknowledged: 'Принято',
}

export const COMPLAINT_TAG_LABEL: Record<string, string> = {
  energy: 'Самочувствие и силы',
  sleep: 'Сон',
  weight: 'Вес и аппетит',
  glucose: 'Сахар крови',
  mood: 'Настроение',
  other: 'Другое',
}

/** Period filter options for old analyses (spec 03). */
export const PERIOD_FILTERS: Array<{ id: string; label: string; days: number | null }> = [
  { id: 'all', label: 'Все', days: null },
  { id: '30', label: '30 дней', days: 30 },
  { id: '90', label: '3 месяца', days: 90 },
  { id: '180', label: '6 месяцев', days: 180 },
  { id: '365', label: 'Год', days: 365 },
]
