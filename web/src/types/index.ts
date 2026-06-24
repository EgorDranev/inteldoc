export type ScreenName =
  | 'qr-entry'
  | 'partner-confirmed'
  | 'value-explainer'
  | 'profile-setup'
  | 'consent'
  | 'grant-access'
  | 'prep-home'
  | 'visit-checklist'
  | 'add-analysis'
  | 'doc-quality-check'
  | 'ocr-review'
  | 'analysis-card'
  | 'analysis-history'
  | 'exam-plan'
  | 'notification'
  | 'plan-progress'
  | 'confirm-appointment'
  | 'success'

export type OcrStatus = 'recognized' | 'needs-review' | 'no-ocr'
export type AccessStatus = 'active' | 'expired' | 'none'
export type PlanItemStatus = 'done' | 'pending' | 'overdue'
export type ChipVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'

export interface MetricValue {
  parameter: string
  value: string | number
  unit: string
  referenceRange: string
  flag: 'normal' | 'high' | 'low'
  confidence: 'high' | 'low'
}

export interface Analysis {
  id: string
  title: string
  source: string
  date: string
  format: string
  ocrStatus: OcrStatus
  qualityStatus: string
  accessStatus: string
  metrics: MetricValue[]
}

export interface PlanItem {
  id: string
  title: string
  dueDate: string
  status: PlanItemStatus
  whyNeeded: string
}

export interface AppState {
  consentGiven: boolean
  profileSaved: boolean
  accessGranted: boolean
  uploadedAnalysisId: string | null
  planItemsCompleted: string[]
  appointmentConfirmed: boolean
  selectedAnalysisId: string | null
}
