// IntelDoc — централизованный каталог русских копий для пациентского прототипа.
//
// Этот файл — единственный источник пользовательских строк. Компоненты пока
// продолжают держать строки у себя; миграция JSX → copy.* — отдельный пасс.
//
// Правила:
// 1. Ключи семантические, не текстовые (`access.expiredBadge`, не «Доступ истёк»).
// 2. Шаблоны — функции с типизированными аргументами, чтобы не было «сырых» template-strings.
// 3. Дисклеймер ИИ единый: copy.common.aiDisclaimer.
// 4. Запрещены: «диагноз», «назначение лечения», «рецепт» как функции продукта.
// 5. Тон — спокойный, поддерживающий, без алармизма; рассчитан на 35–65 лет.
//
// Юридический и онбординговый текст реэкспортится из `src/lib/consent-text.ts` —
// чтобы не дублировать и не разъезжаться по версиям.

import {
  CONSENT_BLOCKS,
  ACCESS_GRANT_DOCUMENT,
  ACCESS_GRANT_VERSION,
} from '../lib/consent-text'

// ─── Common ─────────────────────────────────────────────────────────────────
const common = {
  // Кнопки
  next: 'Далее',
  back: 'Назад',
  save: 'Сохранить',
  cancel: 'Отмена',
  close: 'Закрыть',
  retry: 'Попробовать ещё раз',
  continue: 'Продолжить',
  open: 'Открыть',
  edit: 'Изменить',
  ok: 'Понятно',
  done: 'Готово',
  add: 'Добавить',

  // Статусы / бейджи
  required: 'Обязательно',
  optional: 'Необязательно',
  accepted: 'Принято',
  uploaded: 'Загружено',
  ready: 'Готово',
  signed: 'Подписано',
  notRead: 'Не прочитано',
  inReview: 'На проверке',
  toUpload: 'К загрузке',
  reviewedByDoctor: 'Просмотрено врачом',
  viewed: 'Просмотрено',
  newBadge: 'Новое',
  appointment: 'Запись',
  revoked: 'Отозван',

  // Aria-labels
  ariaBack: 'Назад',
  ariaClose: 'Закрыть',
  ariaAdd: 'Добавить',
  ariaNotifications: 'Уведомления',
  ariaProfile: 'Профиль',
  ariaSearch: 'Поиск по анализам',
  ariaPeriodFilter: 'Фильтр по периоду',
  ariaClearSearch: 'Очистить поиск',
  ariaVoiceInput: 'Голосовой ввод',

  // Дисклеймеры
  aiDisclaimer: 'Это не заменяет консультацию врача.',
  appHelpsDisclaimer:
    'Приложение помогает собрать и структурировать данные для визита. Это не заменяет консультацию врача.',
  notMedicalConclusion:
    'Это не медицинское заключение. Решения принимает ваш врач.',
  informationOnly: 'Это информационная подсказка. Решения принимает ваш врач.',

  // Generic empty / loading / error
  loading: 'Загрузка…',
  saving: 'Сохраняем…',
  somethingWrong: 'Что-то пошло не так. Попробуем ещё раз?',
} as const

// ─── Partner / clinic context ───────────────────────────────────────────────
const partner = {
  shortName: 'Эндокор',
  fullName: 'Медицинский центр «Эндокор»',
  department: 'Отделение эндокринологии',
  diabetologyDepartment: 'Отделение диабетологии',
  lpu: 'Эндокор / ЛПУ №1',
  withDepartment: 'Эндокор · Отделение диабетологии',
  cardScope: 'всех врачей клиники',
} as const

// ─── Tabs ───────────────────────────────────────────────────────────────────
const tabs = {
  home: 'Главная',
  prep: 'Подготовка',
  history: 'История',
  profile: 'Профиль',
} as const

// ─── Welcome (entry/Welcome.tsx) ────────────────────────────────────────────
const welcome = {
  kicker: 'Зачем IntelDoc',
  title: 'Подготовьтесь к приёму — без лишних шагов',
  body:
    'Вместо того чтобы искать бланки и пересказывать историю на каждом визите — загрузите один раз, и данные будут там, где нужно.',
  cta: 'Создать профиль',
  usps: {
    allInOne: {
      title: 'Всё в одном месте',
      body:
        'Загружайте анализы из любых лабораторий — Инвитро, Гемотест, KDL. Все данные хранятся вместе.',
    },
    prepare: {
      title: 'Подготовьтесь к приёму',
      body:
        'Следуйте чек-листу, выполните план обследования врача и приходите на визит полностью подготовленными.',
    },
    accessControl: {
      title: 'Вы контролируете доступ',
      body:
        'Только вы решаете, кто и как долго видит ваши данные. Доступ можно отозвать в любой момент.',
    },
  },
} as const

// ─── Account (entry/Account.tsx) ────────────────────────────────────────────
const account = {
  progress: 'Профиль · Шаг 1 из 2',
  title: 'Аккаунт',
  help: 'Только необходимое. Медицинские данные заполним на следующем шаге.',
  fields: {
    name: 'ПОЛНОЕ ИМЯ',
    dob: 'ДАТА РОЖДЕНИЯ',
    gender: 'ПОЛ',
    phone: 'ТЕЛЕФОН',
    email: 'EMAIL (НЕОБЯЗАТЕЛЬНО)',
  },
  placeholders: {
    name: 'Иванова Мария',
    phone: '+7 (___) ___-__-__',
    email: 'example@mail.ru',
  },
  helpers: {
    phone: 'Понадобится для связи и подтверждения юридически значимых действий.',
  },
  gender: {
    female: 'Женский',
    male: 'Мужской',
  },
  errors: {
    nameTooShort: 'Укажите имя и фамилию',
    nameInvalidChars: 'Только кириллица, пробелы и дефисы',
    nameNotTwoWords: 'Имя и фамилия — минимум два слова',
    dobMissing: 'Укажите дату рождения',
    dobInvalid: 'Неверная дата',
    dobInFuture: 'Дата не может быть в будущем',
    dobTooYoung: 'Должно быть не меньше 14 лет',
    genderMissing: 'Выберите пол',
    phoneMissing: 'Укажите номер телефона',
    phoneWrongLength: 'Нужно 11 цифр (формат +7 ...)',
    phoneWrongPrefix: 'Номер должен начинаться с +7 или 8',
    emailInvalid: 'Неверный формат email',
  },
} as const

// ─── Access state (AccessCard / Profile) ────────────────────────────────────
// The access grant itself is captured as a consent block inside Consents.tsx;
// these strings cover only the post-grant lifecycle surfaces (AccessCard on
// Profile, revoke flow, etc.).
const access = {
  recipientRow: 'Получатель',
  scopeRow: 'Распространяется на',
  expiryRow: 'Срок',
  expiryLifetime: 'бессрочно',
  expiryUntil: (date: string) => `до ${date}`,
  revokeHelper:
    'Доступ можно отозвать здесь же — клиника увидит, что данные больше не передаются.',

  // Документ согласия — централизован в consent-text.ts
  document: ACCESS_GRANT_DOCUMENT,
  documentVersion: ACCESS_GRANT_VERSION,
} as const

// ─── Consents (entry/Consents.tsx) + ConsentModal ───────────────────────────
const consents = {
  progress: 'Согласия · Последний шаг',
  title: 'Согласия',
  help:
    'Для работы с вашими медицинскими данными нам нужны отдельные согласия по каждому основанию обработки. Нажмите на блок, чтобы прочитать полный текст.',
  banner:
    'Данные защищены. Согласия разнесены по закону, чтобы вы осознанно контролировали каждое основание обработки своих данных.',

  required: 'Обязательно',
  optional: 'Необязательно',
  accepted: 'Принято',
  notRead: 'Не прочитано',

  primaryCta: 'Принять и продолжить',
  saving: 'Сохраняем…',
  saveError: 'Не удалось сохранить согласия. Попробуйте ещё раз.',

  footerNote:
    'Любое из согласий можно отозвать в разделе «Настройки → Согласия». Отзыв некоторых согласий может ограничить работу сервиса — мы предупредим вас об этом.',

  // Маркетинг — bottom sheet с каналами
  marketing: {
    title: 'Информационные и рекламные рассылки',
    help: 'Выберите удобные каналы. Согласие можно отозвать в любой момент.',
    channels: {
      email: 'Email',
      sms: 'SMS',
      push: 'Push-уведомления',
    },
    saveAccepted: 'Сохранить',
    subscribe: 'Подписаться',
  },

  // ConsentModal
  modal: {
    blockLabel: (block: string | number) => `Согласие · блок ${block}`,
    a11yCheckbox:
      'Я ознакомился(ась) с полным текстом и готов(а) подтвердить согласие.',
    gatedHint:
      'Чтобы продолжить, прочитайте текст до конца или отметьте, что ознакомились.',
    accept: 'Я прочитал(а) и согласен(а)',
  },

  // Юридические блоки A/B/D — реэкспорт
  blocks: CONSENT_BLOCKS,
} as const

// ─── Setup loading screen (entry/Setup.tsx) ─────────────────────────────────
const setup = {
  vasilyKicker: 'Василий',
  title: 'Готовлю ваше пространство…',
  steps: {
    saveProfile: 'Сохраняю профиль…',
    connectClinic: 'Подключаю клинику…',
    openHome: 'Открываю главный экран…',
  },
  srStatus: 'Открываем главный экран',
  errorMessage: 'Что-то пошло не так. Попробуем ещё раз?',
  retryCta: 'Попробовать ещё раз',
} as const

// ─── Home (Home.tsx) ────────────────────────────────────────────────────────
const home = {
  greeting: (firstName: string) => `Здравствуйте, ${firstName}`,
  subheading: 'Подготовимся к приёму вместе.',
  servicesLabel: 'Полезные сервисы',
} as const

// ─── Checklist (Checklist.tsx) ──────────────────────────────────────────────
const checklist = {
  headerTitle: 'Подготовка',
  kicker: 'Подготовка к приёму',

  prepCompleteKicker: 'Подготовка завершена',
  prepCompleteHeading: 'Вы готовы к приёму',
  prepCompleteMessage: 'Вы готовы к приёму. Осталось подтвердить запись.',
  prepInProgressMessage:
    'Двигайтесь по разделам в удобном порядке. Можно вернуться позже — ничего не потеряется.',
  bookMainCta: 'Записаться к основному врачу',
} as const

// ─── PrepBanner (PrepBanner.tsx) ────────────────────────────────────────────
const prepBanner = {
  newRequest: {
    kicker: 'Новый запрос',
    heading: 'Врач отправил запрос',
    cta: 'Перейти к загрузке',
  },
  scheduled: {
    kicker: 'Приём запланирован',
    message: 'Подготовка завершена. Если что-то изменится — мы напомним.',
  },
  readyToBook: {
    kicker: 'Подготовка',
    heading: 'Вы готовы к приёму',
    message: 'Запишитесь к основному врачу — все материалы уже загружены.',
    cta: 'Записаться к врачу',
  },
  empty: {
    heading: 'Начните подготовку к приёму',
    cta: 'Открыть чеклист',
  },
  inProgress: {
    heading: 'Продолжите подготовку',
    cta: 'Открыть чеклист',
  },
} as const

// ─── Services carousel + service placeholders ──────────────────────────────
const services = {
  diabetesSchool: {
    title: 'Школа диабета',
    description: 'Материалы и программы для жизни с диабетом',
  },
  meds: {
    title: 'Лекарства и расходники',
    description: 'Подбор нужных товаров и расходников',
  },
  analyses: {
    title: 'Анализы',
    description: 'Запись и сервисы по анализам',
  },
  helpful: {
    title: 'Полезные сервисы',
    description: 'Дополнительные предложения в вашем контексте',
  },
  insurance: {
    title: 'Страхование',
    description: 'ДМС и смежные программы',
  },
  placeholder: {
    title: 'Этот раздел скоро появится',
    help:
      'Готовим контент для вас вместе с клиникой. Сообщим, как только сервис будет доступен.',
    cta: 'Вернуться на главную',
  },
} as const

// ─── Complaints section ─────────────────────────────────────────────────────
const complaints = {
  sectionTitle: 'Жалобы',
  emptyMessage:
    'Опишите, что вас беспокоит — это поможет врачу подготовиться к разговору.',
  ariaEdit: 'Уточнить',

  tags: {
    energy: 'Самочувствие и силы',
    sleep: 'Сон',
    weight: 'Вес и аппетит',
    glucose: 'Сахар крови',
    mood: 'Настроение',
    other: 'Другое',
  },

  addMore: 'Добавить ещё',
  addFirst: 'Добавить жалобу',

  sheet: {
    titleEdit: 'Уточните жалобу',
    titleAdd: 'Опишите, что беспокоит',
    help: 'Свободно, своими словами. Можно по пунктам.',
    placeholder:
      'Например: уровень сахара утром выше нормы, иногда головокружения...',
    categoriesLabel: 'Категории — по желанию',
    disclaimer:
      'Это организационные категории — не диагноз. Решения принимает ваш врач.',
    save: 'Сохранить',
  },
} as const

// ─── Additional doctors section ─────────────────────────────────────────────
const additionalDoctors = {
  sectionTitle: 'Какие ещё врачи могут понадобиться',
  banner:
    'Это рекомендации по подготовке. Решение, к кому записаться, остаётся за вами и вашим врачом.',
  specialists: {
    ophthalmologist: {
      name: 'Офтальмолог',
      reason: 'Контроль состояния сосудов глазного дна',
    },
    cardiologist: {
      name: 'Кардиолог',
      reason: 'Профилактика осложнений со стороны сердца',
    },
    neurologist: {
      name: 'Невролог',
      reason: 'Оценка чувствительности при нейропатии',
    },
    nephrologist: {
      name: 'Нефролог',
      reason: 'Контроль функции почек при сахарном диабете',
    },
  },
  viewAll: 'Посмотреть всех специалистов',
} as const

// ─── Main appointment section ───────────────────────────────────────────────
const mainAppointment = {
  sectionTitle: 'Основная запись',
  location: 'Эндокор · Отделение диабетологии',

  scheduledBadge: 'Запись подтверждена',
  scheduledMessage:
    'Подготовительный визит и материалы автоматически передадутся вашему врачу.',

  notScheduledHeading: 'Основная запись пока не оформлена',
  readyToBookMessage:
    'Подготовка завершена — можно записаться к основному врачу.',
  prepIncompleteMessage: 'Запись появится здесь после выбора времени.',

  bookCta: 'Записаться к основному врачу',
  openCta: 'Открыть запись',
} as const

// ─── Documents section ─────────────────────────────────────────────────────
const documents = {
  sectionTitle: 'Документы',
  items: {
    passport: {
      label: 'Паспорт',
      hint: 'Понадобится для оформления приёма',
    },
    oms: {
      label: 'Полис ОМС',
      hint: 'Подтверждает право на бесплатные услуги',
    },
    snils: {
      label: 'СНИЛС',
      hint: 'По желанию — ускорит оформление',
    },
    referral: {
      label: 'Направление от другого ЛПУ',
      hint: 'Если приём по направлению — добавьте',
    },
  },
  uploadedStatus: 'Загружено',
  readyBadge: 'Готово',
  requiredBadge: 'Обязательно',
  disclaimer:
    'Документы хранятся в зашифрованном виде. Доступ имеет только клиника, которой вы выдали разрешение.',
} as const

// ─── New analyses (assigned by doctor) section ──────────────────────────────
const newAnalyses = {
  sectionTitle: 'Назначил врач',
  bannerTitle: 'План обследования от врача',
  status: {
    toUpload: 'К загрузке',
    inReview: 'На проверке',
    accepted: 'Принято',
  },
  helper:
    'Принятые результаты автоматически попадут в досье — врач увидит их перед приёмом.',
} as const

// ─── Unified analyses section (prescribed + history merged) ────────────────
const analyses = {
  sectionTitle: 'Анализы',
  readiness: {
    noPlan: (count: number) =>
      count === 0
        ? 'Назначений от врача нет. Можно загрузить свои анализы.'
        : `Назначений от врача нет. Сохранено: ${count}.`,
    nothingDone: (total: number) =>
      `К приёму нужно собрать ${total}.`,
    partial: (done: number, total: number) =>
      `К приёму готово ${done} из ${total}.`,
    allDone: 'Всё готово к приёму.',
  },
  prescribedHeading: 'Назначил врач',
  historyHeading: 'Мои анализы',
  reuseSuggestion: 'У вас уже есть подходящий анализ',
  reuseAction: 'Использовать',
  freshness: {
    fresh: 'Свежий',
    aging: 'Устаревает',
    stale: 'Устарел',
  },
  uploadCta: 'Загрузить анализ',
  // Due-date chip on a prescribed plan row. Tone shifts as срок приближается.
  due: {
    overdue: 'Просрочено',
    today: 'Срок сегодня',
    tomorrow: 'Срок завтра',
    inDays: (days: number) => `Срок через ${days} дн.`,
    onDate: (dateLabel: string) => `до ${dateLabel}`,
  },
  // Pre-visit hint banner — fires only когда приём ≤7 дней и есть невыполненные.
  preVisit: {
    titleWithLabs: (dateLabel: string) => `До приёма ${dateLabel} — донесите:`,
    allReadyTitle: (dateLabel: string) => `К приёму ${dateLabel} всё готово`,
    allReadyHelp: 'Врач увидит результаты в досье до визита.',
  },
  // Hero + compact-list preview of «Мои анализы» (JTBD #4).
  history: {
    sectionLink: 'История',
    heroSuffix: 'последний результат',
    heroRefPrefix: 'норма',
    heroNoValueTitle: 'Ещё не сдавали',
    heroNudgeForDiabetes:
      'HbA1c — ключевой показатель контроля диабета. Врач увидит динамику.',
    heroNudgeGeneric:
      'Загрузите свежий анализ — врач увидит контекст до приёма.',
    otherRecordsHeading: 'Другие записи',
    moreInHistory: (count: number) => `+ ${count} в истории`,
  },
  // Notification-style hint shown at the top of the section when there are
  // no prescribed analyses — turns the section from a status report into
  // a soft instruction with two affordances.
  noPlanHint: {
    title: 'Назначений от врача нет',
    bodyEmpty:
      'Когда врач что-то назначит — увидите здесь.',
    bodyWithArchive: (count: number) =>
      `Когда врач что-то назначит — увидите здесь. Сохранено анализов: ${count}.`,
    primary: 'История',
    secondary: 'Назначения',
  },
} as const

// ─── Old analyses section ──────────────────────────────────────────────────
const oldAnalyses = {
  sectionTitle: 'Старые анализы',
  periods: {
    all: 'За всё время',
    last30: 'Последние 30 дней',
    last90: 'Последние 3 месяца',
    last365: 'Последний год',
  },
  emptyCta: 'Загрузить анализ',
  emptyHelp: 'Распознаем значения автоматически',
  searchLabel: 'Поиск',
  periodLabelAll: 'Период',
  searchPlaceholder: 'Например: HbA1c',
  filteredEmptyHeading: 'Под фильтр ничего не подошло',
  filteredEmptyHelp: 'Попробуйте изменить период или очистить поиск.',
  resetFilters: 'Сбросить фильтры',
  showAll: (count: number) => `Показать всё (${count})`,
} as const

// ─── Vasily helper screen + tile ───────────────────────────────────────────
const vasily = {
  headerTitle: 'Василий',
  intro: 'Здравствуйте! Я Василий, ваш цифровой помощник. Чем могу помочь?',
  inputPlaceholder: 'Спросите Василия…',
  ariaVoice: 'Голосовой ввод',
  messageDisclaimer: 'Это информационная подсказка. Решения принимает ваш врач.',
  voiceError:
    'Не удалось распознать голос. Попробуйте ещё раз или напишите текстом.',
  voiceErrorDismiss: 'Понятно',

  suggestions: {
    whatToBring: {
      prompt: 'Что взять с собой на приём',
      reply:
        'На приём возьмите паспорт, полис ОМС, направление (если есть) и недавние результаты анализов. Все документы можно загрузить заранее — врач увидит их до визита.',
      cta: 'Открыть чек-лист',
    },
    prepareForAnalyses: {
      prompt: 'Как подготовиться к анализам',
      reply:
        'Большинство анализов сдают утром натощак — последний приём пищи за 8–12 часов. За день лучше не нагружать организм спортом и не пить алкоголь. Точные правила для конкретного анализа подскажет ваш врач.',
      cta: 'Загрузить анализ',
    },
    whyDocuments: {
      prompt: 'Зачем нужны документы',
      reply:
        'Документы нужны, чтобы клиника подтвердила вашу личность и оформила приём без лишних бумаг. Это разовое действие — после первой загрузки они будут доступны на каждом визите.',
      cta: 'Открыть документы',
    },
    whatHappensAtVisit: {
      prompt: 'Что будет на приёме',
      reply:
        'Врач посмотрит анализы и жалобы, задаст уточняющие вопросы и обсудит дальнейшие шаги. Если потребуются дополнительные обследования — они придут запросом в приложение.',
      cta: 'Посмотреть план',
    },
  },

  // Бот-фолбэки (compliance-safe — без диагнозов и назначений)
  diagnosisFallback:
    'Я не ставлю диагнозы и не назначаю лечение — это работа врача. Но я могу подсказать, что взять с собой и как подготовиться, чтобы приём прошёл продуктивно.',
  defaultReply:
    'Готов подсказать по подготовке к приёму, документам и анализам. Если хотите, давайте начнём с чек-листа — там видно, что осталось.',

  // Tile на главном
  tile: {
    kicker: 'Василий',
    heading: 'Есть вопросы? Спросите Василия',
    description: 'Подскажу по подготовке и подскажу, что взять.',
  },
} as const

// ─── BookMain (BookMain.tsx) ────────────────────────────────────────────────
const bookMain = {
  headerTitle: 'Запись к врачу',
  kicker: 'Запись к основному врачу',
  title: 'Выберите удобное время',
  subtitle:
    'Подготовка завершена — остаётся только выбрать день. Все слоты доступны в клинике Эндокор.',
  specialty: 'Отделение диабетологии',
  slotsLabel: 'Доступные слоты',
  bookCta: 'Записаться',
  successHeading: 'Приём запланирован',
  successMessage:
    'Напомним за день. Если что-то изменится — сообщим первыми.',
} as const

// ─── ExtraDoctors (ExtraDoctors.tsx) ────────────────────────────────────────
const extraDoctors = {
  headerTitle: 'Другие врачи',
  kicker: 'Специалисты Эндокор',
  title: 'Кого ещё может быть полезно посетить',
  help: 'Это рекомендации по подготовке. Решение остаётся за вами и вашим врачом.',
  emptyHeading: 'Свободных слотов пока нет',
  emptyHelp: 'Зайдите позже — расписание обновляется ежедневно.',
  pickLabel: 'Выберите врача',
  successHeading: 'Запись оформлена',
  successMessage: 'Напомним заранее.',
  bookCta: 'Записаться',
} as const

// ─── Document upload (DocUpload.tsx) ────────────────────────────────────────
const docUpload = {
  headerTitle: 'Загрузка документа',
  title: 'Как загрузить?',
  help:
    'Документ сохраним в зашифрованном виде. Доступен будет только клинике, которой вы выдали доступ.',

  docLabels: {
    passport: 'Паспорт',
    oms: 'Полис ОМС',
    snils: 'СНИЛС',
    referral: 'Направление',
    other: 'Документ',
  },

  options: {
    photo: { title: 'Сделать фото', hint: 'Сфотографируйте документ' },
    gallery: { title: 'Из галереи', hint: 'Выберите изображение' },
    file: { title: 'Выбрать файл', hint: 'PDF или фото' },
  },

  uploading: 'Загружаем файл…',
  qualityOk: 'Изображение чёткое',
  done: 'Сохранено',
} as const

// ─── Analysis upload + OCR (UploadFlow.tsx) ─────────────────────────────────
const uploadFlow = {
  headerTitle: 'Загрузка анализа',
  title: 'Как загрузить?',
  help:
    'Василий распознает данные и заполнит карту анализа. Можно поправить вручную перед сохранением.',

  typeLabels: {
    HbA1c: 'Гликированный гемоглобин (HbA1c)',
    glucose: 'Глюкоза крови натощак',
    creatinine: 'Креатинин',
    cholesterol: 'Холестерин',
    other: 'Анализ',
  },

  options: {
    photo: { title: 'Сделать фото', hint: 'Сфотографируйте бланк' },
    gallery: { title: 'Из галереи', hint: 'Выберите изображение' },
    file: { title: 'Выбрать файл', hint: 'PDF или фото с устройства' },
  },

  uploading: 'Загружаем файл…',
  qualityOk: 'Изображение чёткое',
  vasilyProcessingHint: 'Сейчас Василий распознает значения.',

  ocrHeaderTitle: 'Распознавание',
  ocrVasilyKicker: 'Василий',
  ocrProcessingHeading: 'Василий распознаёт данные',
  ocrQualityMessage: 'Изображение чёткое · значения распознаны',

  reviewHeaderTitle: 'Проверьте распознанные данные',
  reviewSectionLabel: 'Распознанные значения',
  reviewHint: 'Нажмите поле, чтобы изменить.',

  saveCta: 'Сохранить',
  doneHeading: 'Сохранено',
} as const

// ─── Analysis card (AnalysisCardScreen.tsx) ─────────────────────────────────
const analysisCard = {
  headerTitle: 'Анализ',
  notFoundHeading: 'Анализ не найден',
  backToHistory: 'Вернуться в историю',
  noDate: 'без даты',
  acceptedBadge: 'Принято',
  uploadedBadge: 'Загружено',
  originalLabel: 'Оригинал документа',
  originalMeta: 'PDF · загружен',
  metricsSection: 'Распознанные значения',
  notMedicalConclusion:
    'Это не медицинское заключение. Решения принимает ваш врач.',
} as const

// ─── History (History.tsx) ──────────────────────────────────────────────────
const history = {
  headerTitle: 'История',
  emptyHeading: 'Здесь будет история ваших действий',
  emptyMessage:
    'Когда вы начнёте загружать анализы и получать обновления — они появятся здесь.',
  emptyCta: 'Добавить анализ',

  analysisAcceptedDescription: 'Принято врачом',
  analysisUploadedDescription: 'Распознано и сохранено',
  acceptedBadge: 'Принято',
  uploadedBadge: 'Загружено',

  documentTitle: (label: string) => `Документ: ${label}`,
  documentDescription: 'Загружен и зашифрован',
  documentBadge: 'Готово',

  accessGrantedTitle: 'Доступ выдан клинике Эндокор',
  accessGrantedDescription: 'Бессрочно, для всей клиники',
  accessRevokedTitle: 'Доступ отозван',
  accessRevokedBadge: 'Отозван',

  doctorRequestTitle: 'Запрос от врача',
  viewedBadge: 'Просмотрено',
  newBadge: 'Новое',

  appointmentTitle: 'Приём запланирован',
  appointmentBadge: 'Запись',
} as const

// ─── Notification action (NotificationAction.tsx) ──────────────────────────
const notification = {
  headerTitle: 'Запрос от врача',
  notFoundHeading: 'Запрос не найден',
  backToHome: 'Вернуться на главную',
  kicker: 'Новый запрос',
  doctorMeta: (name: string, specialty: string) => `${name} · ${specialty}`,
  itemsLabel: 'Что нужно загрузить',
  noItemsMessage: 'Конкретных пунктов нет — это сообщение для ознакомления.',
  toUploadBadge: 'К загрузке',
  goToUploadCta: 'Перейти к загрузке',
} as const

// ─── Profile screen (Profile.tsx) ──────────────────────────────────────────
const profile = {
  headerTitle: 'Профиль',
  fallbackName: 'Иванова Мария Сергеевна',
  dobPrefix: (date: string) => `Дата рождения: ${date}`,
  dobMissing: 'Дата рождения не указана',

  contactsSection: 'Контакты',
  clinicSection: 'Связь с клиникой',
  clinicRecipient: 'Получатель',
  clinicShortName: 'Эндокор',
  clinicScopeRow: 'Распространяется на',
  clinicScopeValue: 'всех врачей клиники',
  clinicExpiryRow: 'Срок',
  clinicExpiryUntil: (date: string) => `до ${date}`,
  clinicExpiryLifetime: 'бессрочно',
  clinicHelper:
    'Доступ можно отозвать здесь же — клиника увидит, что данные больше не передаются.',

  notificationsSection: 'Уведомления',
  pushTitle: 'Push-уведомления',
  pushDescription: 'Сообщим о запросах врача и обновлениях плана',
  emailTitle: 'Email-уведомления',
  emailDescription: 'Дублируем важные события на почту',
  remindersTitle: 'Напоминания о подготовке',
  remindersDescription: 'Заранее напомним, что осталось загрузить',

  historyCta: 'История действий',
  historyDescription: 'Что и когда происходило с вашими данными',

  resetCta: 'Сбросить демо-профиль',
  resetDisclaimer:
    'Это демо-режим. Реальные данные не передаются. После сброса можно пройти онбординг заново.',
} as const

// ─── Top header (TopHeader.tsx) ─────────────────────────────────────────────
const topHeader = {
  partnerLabel: 'Эндокор',
  ariaNotifications: 'Уведомления',
  ariaProfile: 'Профиль',
} as const

// ─── Demo toolbar (system/DemoToolbar.tsx) ──────────────────────────────────
const demoToolbar = {
  reset: 'Сбросить',
  patient: 'Пациент',
  doctor: 'Врач',
  segments: 'Сегменты',
  close: 'Закрыть',
} as const

// ─── Empty / error / formatters ─────────────────────────────────────────────
const empty = {
  noResultsForFilters: 'Под фильтр ничего не подошло',
  comingSoon: 'Этот раздел скоро появится',
  noSlots: 'Свободных слотов пока нет',
  historyAwaiting: 'Здесь будет история ваших действий',
} as const

const errors = {
  generic: 'Что-то пошло не так. Попробуем ещё раз?',
  signFailed: 'Не удалось подписать. Попробуйте ещё раз.',
  consentSaveFailed: 'Не удалось сохранить согласия. Попробуйте ещё раз.',
  voiceFailed:
    'Не удалось распознать голос. Попробуйте ещё раз или напишите текстом.',
} as const

// ─── Public catalog ─────────────────────────────────────────────────────────
export const copy = {
  common,
  partner,
  tabs,
  welcome,
  account,
  access,
  consents,
  setup,
  home,
  checklist,
  prepBanner,
  services,
  complaints,
  additionalDoctors,
  mainAppointment,
  documents,
  analyses,
  newAnalyses,
  oldAnalyses,
  vasily,
  bookMain,
  extraDoctors,
  docUpload,
  uploadFlow,
  analysisCard,
  history,
  notification,
  profile,
  topHeader,
  demoToolbar,
  empty,
  errors,
} as const

export type Copy = typeof copy
