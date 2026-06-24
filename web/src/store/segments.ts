import { getState, setState } from './store'
import { SEED } from './seed'
import {
  completeEntryFlow,
  openPatientRecord,
  openNotification,
  sendRequest,
  uploadAnalysis,
  uploadDocument,
  acknowledgeAnalysis,
  addComplaint,
} from './actions'

/**
 * Each segment helper jumps the store to the state expected at the START of
 * that demo segment, then returns the recommended landing route. Idempotent:
 * always begins by resetting to seed, then re-applies prior segments.
 */

export const SEGMENT_LABELS: Record<number, string> = {
  1: 'Онбординг',
  2: 'Подготовка',
  3: 'Кокпит врача',
  4: 'Уведомление',
  5: 'Запись',
}

export interface Segment {
  id: number
  label: string
  /** Returns the route to navigate to after seeding. */
  apply: () => Promise<string> | string
}

function freshStart() {
  setState({ ...SEED })
}

async function seedMaria() {
  freshStart()
  await completeEntryFlow({
    name: 'Иванова Мария Сергеевна',
    dob: '1972-02-10',
    gender: 'female',
    phone: '+7 (916) 555-12-01',
  })
}

async function seedPrep() {
  await seedMaria()
  // upload an HbA1c (the magic-moment analysis) and a couple of documents,
  // and add a complaint so the doctor has something to react to.
  uploadDocument({ type: 'passport', label: 'Паспорт' })
  uploadDocument({ type: 'oms', label: 'Полис ОМС' })
  addComplaint(
    'Утром сахар часто выше нормы. Иногда головокружения после нагрузок.',
  )
  await uploadAnalysis({ type: 'HbA1c' })
  // Demo enrichment: mark the HbA1c as low-confidence so the History tab
  // surfaces the «Требует проверки» guardrail badge.
  setState((s) => ({
    analyses: s.analyses.map((a) =>
      a.patientId === 'p1' && a.type === 'HbA1c'
        ? { ...a, qualityCheck: 'acceptable' as const }
        : a,
    ),
  }))
}

async function seedDoctorReady() {
  await seedPrep()
  // Doctor takes the patient over in the cockpit.
  openPatientRecord('p1')
}

async function seedRequestSent() {
  await seedDoctorReady()
  const request = sendRequest({
    title: 'Дополнительные анализы перед приёмом',
    body: 'Мария, перед приёмом нам важно увидеть актуальные значения. Загрузите, пожалуйста, результаты ниже — это займёт несколько минут.',
    items: [
      {
        analysisType: 'glucose',
        label: 'Глюкоза крови натощак',
        reason: 'Контроль текущего уровня перед визитом',
      },
      {
        analysisType: 'creatinine',
        label: 'Креатинин + СКФ',
        reason: 'Базовая оценка функции почек',
      },
    ],
  })
  // Demo enrichment: spread plan item due-dates so the analyses tab shows
  // a mix of urgency states — overdue (glucose) and «через 2 дн.» (creatinine).
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const inTwoDays = new Date()
  inTwoDays.setDate(inTwoDays.getDate() + 2)
  setState((s) => ({
    planItems: s.planItems.map((p) =>
      p.requestId === request.id
        ? {
            ...p,
            dueDate:
              p.analysisType === 'glucose'
                ? yesterday.toISOString()
                : inTwoDays.toISOString(),
          }
        : p,
    ),
  }))
  // Demo enrichment: an upcoming main appointment 5 days out so the
  // pre-visit hint banner fires on the prep checklist (JTBD #2).
  const inFiveDays = new Date()
  inFiveDays.setDate(inFiveDays.getDate() + 5)
  inFiveDays.setHours(10, 0, 0, 0)
  setState((s) => ({
    appointments: [
      {
        id: 'appt-p1-main',
        patientId: 'p1',
        doctorId: s.currentDoctorId,
        type: 'main',
        date: inFiveDays.toISOString(),
        status: 'scheduled',
        createdAt: new Date().toISOString(),
      },
      ...s.appointments.filter((a) => a.patientId !== 'p1'),
    ],
  }))
}

async function seedReadyToBook() {
  await seedRequestSent()
  // Patient opened the notification, then uploaded the requested analysis
  // (linked to the plan item). Doctor then acknowledged it.
  const s = getState()
  const request = s.doctorRequests.find(
    (r) => r.patientId === 'p1' && !r.seenByPatient,
  )
  if (request) openNotification(request.id)
  const planItemId = getState().planItems.find(
    (p) => p.patientId === 'p1' && p.analysisType === 'glucose' && p.status === 'assigned',
  )?.id
  const glucose = await uploadAnalysis({ type: 'glucose', planItemId })
  acknowledgeAnalysis(glucose.id)
}

export const SEGMENTS: Segment[] = [
  {
    id: 1,
    label: SEGMENT_LABELS[1],
    apply: async () => {
      freshStart()
      return '/patient/entry/welcome'
    },
  },
  {
    id: 2,
    label: SEGMENT_LABELS[2],
    apply: async () => {
      await seedMaria()
      return '/patient/home'
    },
  },
  {
    id: 3,
    label: SEGMENT_LABELS[3],
    apply: async () => {
      await seedPrep()
      return '/doctor/patients/p1'
    },
  },
  {
    id: 4,
    label: SEGMENT_LABELS[4],
    apply: async () => {
      await seedRequestSent()
      return '/patient/home'
    },
  },
  {
    id: 5,
    label: SEGMENT_LABELS[5],
    apply: async () => {
      await seedReadyToBook()
      return '/patient/checklist'
    },
  },
]
