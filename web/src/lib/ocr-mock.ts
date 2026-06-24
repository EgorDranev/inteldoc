import type { AnalysisType } from '../store/types'

export interface OcrResult {
  label: string
  fields: Record<string, string>
}

const OCR_FIXTURES: Record<AnalysisType, OcrResult> = {
  HbA1c: {
    label: 'Гликированный гемоглобин (HbA1c)',
    fields: {
      HbA1c: '7.2 %',
      дата: '12.02.2026',
      норма: '< 6.5 %',
    },
  },
  glucose: {
    label: 'Глюкоза крови натощак',
    fields: {
      Глюкоза: '8.4 ммоль/л',
      дата: '14.02.2026',
      норма: '3.9–5.6 ммоль/л',
    },
  },
  creatinine: {
    label: 'Креатинин',
    fields: {
      Креатинин: '92 мкмоль/л',
      дата: '14.02.2026',
      норма: '62–106 мкмоль/л',
    },
  },
  cholesterol: {
    label: 'Холестерин общий + ЛПНП',
    fields: {
      Холестерин: '5.8 ммоль/л',
      ЛПНП: '3.9 ммоль/л',
      дата: '10.02.2026',
    },
  },
  other: {
    label: 'Анализ',
    fields: { дата: '01.02.2026' },
  },
}

const OCR_LATENCY_MS = 1200

export function runOcr(type: AnalysisType): Promise<OcrResult> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(OCR_FIXTURES[type]), OCR_LATENCY_MS)
  })
}
