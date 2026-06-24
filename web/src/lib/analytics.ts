// Analytics dispatcher. Typed event union covers the consolidated list from
// the spec § "Suggested analytics events". Prototype pipes events to console;
// swap pipeFn for a real client (Amplitude / Segment / etc.) when wiring up.

import type { AckMechanism, ConsentBundle, ConsentId } from '../store/types'

export type AnalyticsEvent =
  // Returning-patient login (ENG-09)
  | { name: 'patient_login_viewed' }
  | { name: 'patient_login_code_requested' }
  | { name: 'patient_login_success' }
  | { name: 'patient_login_failed' }
  // Welcome
  | { name: 'welcome_viewed' }
  | { name: 'usp_in_view'; uspId: 'partner' | 'all_in_one' | 'prepare' | 'access_control' }
  | { name: 'welcome_cta_tapped'; dwellMs: number }
  // Account
  | { name: 'account_viewed' }
  | { name: 'account_field_blurred'; field: string; valid: boolean }
  | { name: 'account_submitted' }
  | { name: 'account_validation_error'; fields: string[] }
  // Access grant
  | { name: 'access_grant_viewed' }
  | { name: 'access_grant_confirm_checked' }
  | { name: 'access_grant_signed'; esignId: string } // synthesised — replaces esign_otp_*
  | { name: 'access_granted'; grantId: string; esignId: string }
  // Consents
  | { name: 'consents_viewed' }
  | { name: 'consent_block_tapped'; consentId: ConsentId }
  | { name: 'consent_modal_scrolled_to_end'; consentId: ConsentId }
  | {
      name: 'consent_acknowledged'
      consentId: ConsentId
      versionId: string
      ackMechanism: AckMechanism
    }
  | {
      name: 'consent_opt_in_toggled'
      consentId: ConsentId
      channels: string[]
    }
  | { name: 'consent_sms_sent'; consentId: ConsentId }
  | { name: 'consent_sms_verified'; consentId: ConsentId; versionId: string }
  | { name: 'consent_sms_failed'; consentId: ConsentId }
  | { name: 'consents_submitted'; bundle: ConsentBundle }
  // Transition
  | { name: 'transition_shown' }
  | { name: 'transition_completed'; durationMs: number }
  | { name: 'transition_error'; errorCode: string }
  // Main
  | { name: 'prep_home_viewed' }
  // Profile · identity & medical baseline
  | { name: 'identity_updated' }
  | { name: 'baseline_updated' }
  // Profile · consents lifecycle (post-onboarding)
  | { name: 'consent_withdrawn'; consentId: ConsentId }
  | { name: 'consent_resigned'; consentId: ConsentId; versionId: string }
  | { name: 'consent_text_reread'; consentId: ConsentId }
  // Profile · data ownership
  | { name: 'my_data_viewed' }
  | { name: 'account_deleted' }
  // Access lifecycle (post-onboarding)
  | { name: 'access_revoked'; grantId: string }
  | { name: 'access_extended'; grantId: string; newExpiresAt: string }
  // Patient flags a recognised value as misrecognised (read-only review — no edit)
  | { name: 'ocr_field_issue_reported'; analysisId: string; field: string }
  // Doctor OCR verification (Сводка → drawer)
  | {
      name: 'ocr_field_verified'
      analysisId: string
      field: string
      decision: 'confirmed' | 'rejected'
    }
  | {
      name: 'analysis_rejected_as_wrong_upload'
      analysisId: string
      reason:
        | 'not_my_clinic'
        | 'wrong_patient'
        | 'wrong_panel'
        | 'duplicate'
        | 'other'
    }
  | {
      name: 'analysis_resend_requested'
      analysisId: string
      reason:
        | 'poor_quality'
        | 'missing_pages'
        | 'date_unreadable'
        | 'lab_stamp_missing'
        | 'other'
    }
  // Admin surface
  | { name: 'admin_kpi_viewed' }
  | {
      name: 'admin_kpi_card_tapped'
      kpiId: 'onboarded' | 'prepRate' | 'ocrRate'
    }
  | {
      name: 'admin_trend_viewed'
      kpiId: 'onboarded' | 'prepRate' | 'ocrRate'
    }
  | {
      name: 'admin_trend_point_inspected'
      kpiId: 'onboarded' | 'prepRate' | 'ocrRate'
      date: string
    }
  | {
      name: 'admin_drilldown_placeholder_viewed'
      selectedKpi?: 'onboarded' | 'prepRate' | 'ocrRate'
    }
  | { name: 'admin_access_by_department_viewed'; totalDepartments: number }
  | { name: 'admin_incidents_viewed'; totalCount: number }
  | { name: 'admin_incident_row_focused'; type: 'revoked' | 'expired' }
  | { name: 'admin_incident_seen'; type: 'revoked' | 'expired' }
  | {
      name: 'admin_compliance_summary_viewed'
      complianceState: 'green' | 'amber' | 'red'
    }
  | {
      name: 'admin_compliance_check_focused'
      checkId: 'n3' | 'n4' | 'n5' | 'n7'
    }
  // Web auth (mocked, no real verification)
  | { name: 'web_login'; role: 'doctor' | 'admin' }
  | { name: 'web_logout'; role: 'doctor' | 'admin' }

type Pipe = (e: AnalyticsEvent) => void

const consolePipe: Pipe = (e) => {
  // eslint-disable-next-line no-console
  console.info('[analytics]', e.name, e)
}

let pipe: Pipe = consolePipe

/** Swap the dispatch destination (e.g. for tests or production wiring). */
export function setAnalyticsPipe(next: Pipe) {
  pipe = next
}

export function track(event: AnalyticsEvent) {
  try {
    pipe(event)
  } catch {
    // analytics must never break the app
  }
}
