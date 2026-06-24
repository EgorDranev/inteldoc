import type { Analysis, PlanItem } from '../types'

export const PARTNER = {
  name: 'Эндокор',
  fullName: 'Медицинский центр «Эндокор»',
  department: 'Отделение эндокринологии',
  lpu: 'Эндокор / ЛПУ №1',
}

export const DOCTOR = {
  name: 'Иванова Елена Сергеевна',
  title: 'эндокринолог',
  department: 'Отделение эндокринологии Эндокор',
}

export const PATIENT = {
  name: 'Смирнова Анна Викторовна',
  age: 46,
  sex: 'Женщина',
  context: 'Диабет / эндокринология',
  phone: '+7 (999) 123-45-67',
  email: 'anna.smirnova@example.com',
}

export const ACCESS = {
  active: {
    status: 'active' as const,
    recipient: 'Отделение эндокринологии Эндокор',
    type: 'Доступ к данным для подготовки к приёму',
    grantedOn: '10 апреля 2026',
    expiresOn: '10 мая 2026',
    viewedBy: 'Просмотрено врачом',
    lastViewed: '12 апреля 2026, 14:35',
  },
  expired: {
    status: 'expired' as const,
    recipient: 'Диабетологическое отделение',
    type: 'Архивный доступ',
    grantedOn: '1 марта 2026',
    expiresOn: '31 марта 2026',
  },
}

export const ANALYSES: Analysis[] = [
  {
    id: 'hba1c',
    title: 'Гликированный гемоглобин (HbA1c)',
    source: 'Инвитро',
    date: '5 апреля 2026',
    format: 'PDF',
    ocrStatus: 'recognized',
    qualityStatus: 'Хорошее качество',
    accessStatus: 'Входит в доступ',
    metrics: [
      {
        parameter: 'HbA1c',
        value: '7.2',
        unit: '%',
        referenceRange: '4.0–6.0',
        flag: 'high',
        confidence: 'high',
      },
    ],
  },
  {
    id: 'glucose',
    title: 'Глюкоза крови натощак',
    source: 'Гемотест',
    date: '3 апреля 2026',
    format: 'Фото',
    ocrStatus: 'needs-review',
    qualityStatus: 'Среднее качество',
    accessStatus: 'Входит в доступ',
    metrics: [
      {
        parameter: 'Глюкоза',
        value: '6.8',
        unit: 'ммоль/л',
        referenceRange: '3.9–5.5',
        flag: 'high',
        confidence: 'low',
      },
    ],
  },
  {
    id: 'creatinine',
    title: 'Креатинин',
    source: 'KDL',
    date: '3 апреля 2026',
    format: 'PDF',
    ocrStatus: 'recognized',
    qualityStatus: 'Хорошее качество',
    accessStatus: 'Входит в доступ',
    metrics: [
      {
        parameter: 'Креатинин',
        value: '81',
        unit: 'мкмоль/л',
        referenceRange: '44–97',
        flag: 'normal',
        confidence: 'high',
      },
    ],
  },
  {
    id: 'cholesterol',
    title: 'Общий холестерин',
    source: 'Инвитро',
    date: '28 марта 2026',
    format: 'Фото',
    ocrStatus: 'no-ocr',
    qualityStatus: 'Низкое качество',
    accessStatus: 'Только оригинал',
    metrics: [],
  },
]

export const PLAN_ITEMS: PlanItem[] = [
  {
    id: 'glucose',
    title: 'Глюкоза крови натощак',
    dueDate: 'До 18 апреля 2026',
    status: 'done',
    whyNeeded: 'Для обновления текущих показателей перед приёмом',
  },
  {
    id: 'hba1c',
    title: 'HbA1c',
    dueDate: 'До 18 апреля 2026',
    status: 'done',
    whyNeeded: 'Для оценки динамики показателей',
  },
  {
    id: 'cholesterol',
    title: 'Общий холестерин',
    dueDate: 'До 18 апреля 2026',
    status: 'pending',
    whyNeeded: 'Для полноты обследования перед визитом',
  },
  {
    id: 'creatinine',
    title: 'Креатинин',
    dueDate: 'До 18 апреля 2026',
    status: 'done',
    whyNeeded: 'Для оценки сопутствующих показателей',
  },
]

export const CHECKLIST_STEPS = [
  { id: 'upload', label: 'Загрузите анализы', done: true },
  { id: 'ocr', label: 'Проверьте распознанные данные', done: false },
  { id: 'access', label: 'Выдайте доступ ЛПУ', done: true },
  { id: 'plan', label: 'Откройте план обследования', done: false },
  { id: 'missing', label: 'Догрузите недостающие результаты', done: false },
  { id: 'appoint', label: 'Подтвердите следующий приём', done: false },
]

export const EVENTS = [
  { label: 'Анализ HbA1c загружен', date: '5 апреля, 10:14' },
  { label: 'Распознавание глюкозы требует проверки', date: '5 апреля, 10:16' },
  { label: 'Доступ ЛПУ выдан', date: '10 апреля, 09:30' },
  { label: 'Врач просмотрел данные', date: '12 апреля, 14:35' },
  { label: 'Получен новый план обследования', date: '12 апреля, 14:42' },
]

export const APPOINTMENT = {
  doctor: 'Иванова Елена Сергеевна',
  department: 'Отделение эндокринологии Эндокор',
  date: '22 апреля 2026',
  time: '11:30',
  format: 'Очный приём',
}
