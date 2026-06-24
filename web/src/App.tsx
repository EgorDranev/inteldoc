import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import DemoToolbar from './components/system/DemoToolbar'
import Welcome from './routes/patient/entry/Welcome'
import PatientLogin from './routes/patient/entry/Login'
import Account from './routes/patient/entry/Account'
import Consents from './routes/patient/entry/Consents'
import Setup from './routes/patient/entry/Setup'
import Home from './routes/patient/Home'
import VasilyHelper from './routes/patient/VasilyHelper'
import Checklist from './routes/patient/Checklist'
import History from './routes/patient/History'
import Notifications from './routes/patient/Notifications'
import AnalysisCardScreen from './routes/patient/AnalysisCardScreen'
import UploadFlow from './routes/patient/UploadFlow'
import DocUpload from './routes/patient/DocUpload'
import NotificationAction from './routes/patient/NotificationAction'
import BookMain from './routes/patient/BookMain'
import ServicePlaceholder from './routes/patient/ServicePlaceholder'
import Support from './routes/patient/Support'
import Profile from './routes/patient/Profile'
import ExtraDoctors from './routes/patient/ExtraDoctors'
import PatientList from './routes/doctor/PatientList'
import PatientRecord from './routes/doctor/PatientRecord'
import AdminDashboard from './routes/admin/Dashboard'
import AdminDrillDown from './routes/admin/DrillDown'
import AdminAccessAudit from './routes/admin/AccessAudit'
import ToastHost from './components/system/ToastHost'
import WebLogin from './routes/web/Login'
import ApiCheck from './routes/dev/ApiCheck'
import PwaReset from './routes/dev/PwaReset'
import InstallPrompt from './pwa/InstallPrompt'
import { useIsStandalone } from './pwa/standalone'
import { useInteldoc } from './store/store'
import { hydratePatientFromBackend } from './store/actions'
import { SEGMENTS } from './store/segments'
import { DEMO_MODE } from './api/config'
import { getAccessToken } from './api/client'

function DemoDeepLink() {
  const { pathname, search } = useLocation()
  const nav = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(search)
    const isDemoPatientRoute =
      params.get('demo') === 'home' &&
      pathname.startsWith('/patient') &&
      !pathname.startsWith('/patient/entry')
    if (!isDemoPatientRoute) return

    const prepSegment = SEGMENTS.find((s) => s.id === 2)
    if (!prepSegment) return

    void Promise.resolve(prepSegment.apply()).then(() => {
      nav(pathname, { replace: true })
    })
  }, [nav, pathname, search])

  return null
}

/**
 * Backend hydration (Slice 2: patient live loop). On mount — in BACKEND_MODE
 * only — re-pull the live patient's analyses + plan from the API using the JWT
 * that survives reload, and refresh the store so the app reads real data. The
 * action self-guards on BACKEND_MODE + an existing token, so this is a no-op in
 * the default mock demo and never blocks first paint (it runs after mount and
 * updates the store reactively).
 */
function BackendHydration() {
  useEffect(() => {
    void hydratePatientFromBackend()
  }, [])
  return null
}

/**
 * First-launch gate.
 * - If onboarding is not complete and the user is on the patient app, force them
 *   into the entry flow.
 * - If onboarding IS complete and they hit /patient/entry/*, send them to home.
 * - Doctor surface and patient/entry/* itself are always allowed (the doctor
 *   cockpit is independent of patient onboarding state for the demo).
 */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const completed = useInteldoc((s) => s.hasCompletedOnboarding)

  const isEntry = pathname.startsWith('/patient/entry')
  // The returning-patient login (ENG-09) is reachable regardless of the
  // onboarding flag — it's the way back in for someone who already onboarded.
  const isLogin = pathname === '/patient/login'
  const isDoctor = pathname.startsWith('/doctor')
  const isDemoPatientRoute =
    pathname.startsWith('/patient') &&
    !pathname.startsWith('/patient/entry') &&
    new URLSearchParams(search).get('demo') === 'home'
  const isPatientNonEntry =
    pathname.startsWith('/patient') && !isEntry && !isLogin

  if (!completed && isPatientNonEntry && !isDemoPatientRoute) {
    return <Navigate to="/patient/entry/welcome" replace />
  }
  const isAllowedCompletedEntry = pathname === '/patient/entry/setup'

  if (completed && isEntry && !isAllowedCompletedEntry) {
    // Allow post-consent intro and setup transition to play out after completed
    // flag flips mid-way.
    return <Navigate to="/patient/home" replace />
  }
  // Doctor surface always allowed.
  void isDoctor
  return <>{children}</>
}

/**
 * Web auth gate — universal login for the doctor + admin surfaces.
 *
 * Mocked: any non-empty credentials work. Routes:
 *  - /doctor/* requires a session with role='doctor'
 *  - /admin/*  requires a session with role='admin'
 *  - /web/login is always public
 *
 * If an authenticated session has the wrong role for the requested area,
 * we send them back to /web/login so they can switch role explicitly.
 */
function WebAuthGate({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const auth = useInteldoc((s) => s.webAuth)

  const isDoctorArea = pathname.startsWith('/doctor')
  const isAdminArea = pathname.startsWith('/admin')

  if (!isDoctorArea && !isAdminArea) return <>{children}</>

  const requiredRole: 'doctor' | 'admin' = isDoctorArea ? 'doctor' : 'admin'
  if (!auth || auth.role !== requiredRole) {
    return (
      <Navigate
        to="/web/login"
        replace
        state={{ from: pathname + (search ?? '') }}
      />
    )
  }
  return <>{children}</>
}

/**
 * Patient auth gate (ENG-09) — production only.
 *
 * In a real pilot build (BACKEND_MODE on, DEMO_MODE off) a patient who isn't
 * signed in can't reach the app: protected /patient routes redirect to the real
 * SMS-OTP login. Onboarding (/patient/entry/*) and the login screen are public so
 * a new patient can register and a returning one can sign back in. No-op in the
 * mock demo and in the demo deploy, which keep the role-switcher entry instead.
 */
function PatientAuthGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  // Demo builds keep the role-switcher entry; non-demo builds always enforce auth
  // (config.ts guarantees a non-demo build runs in BACKEND_MODE).
  if (DEMO_MODE) return <>{children}</>

  const isPatientArea = pathname.startsWith('/patient')
  const isEntry = pathname.startsWith('/patient/entry')
  const isLogin = pathname === '/patient/login'
  if (!isPatientArea || isEntry || isLogin) return <>{children}</>

  if (!getAccessToken()) return <Navigate to="/patient/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <DemoDeepLink />
      <BackendHydration />
      <PatientAuthGate>
       <OnboardingGate>
       <WebAuthGate>
        <Routes>
          {/* Default: send to entry flow */}
          <Route path="/" element={<Navigate to="/patient/entry/welcome" replace />} />

          {/* Universal web login (doctor + admin) */}
          <Route path="/web" element={<Navigate to="/web/login" replace />} />
          <Route path="/web/login" element={<WebLogin />} />

          {/* Returning-patient login — real phone + SMS-OTP (ENG-09) */}
          <Route path="/patient/login" element={<PatientLogin />} />

          {/* Patient onboarding (Vasily greeting + 3 form steps + transition) */}
          <Route path="/patient/entry" element={<Navigate to="/patient/entry/welcome" replace />} />
          <Route path="/patient/entry/welcome" element={<Welcome />} />
          <Route path="/patient/entry/account" element={<Account />} />
          <Route
            path="/patient/entry/access"
            element={<Navigate to="/patient/entry/consents" replace />}
          />
          <Route path="/patient/entry/consents" element={<Consents />} />
          <Route
            path="/patient/entry/vasily-onboarding"
            element={<Navigate to="/patient/entry/welcome" replace />}
          />
          <Route path="/patient/entry/setup" element={<Setup />} />

          {/* Patient app (post-onboarding) */}
          <Route path="/patient/home" element={<Home />} />
          <Route path="/patient/vasily" element={<VasilyHelper />} />
          <Route path="/patient/history" element={<History />} />
          <Route path="/patient/notifications" element={<Notifications />} />
          <Route path="/patient/history/:analysisId" element={<AnalysisCardScreen />} />
          <Route path="/patient/checklist" element={<Checklist />} />
          <Route path="/patient/upload" element={<UploadFlow />} />
          <Route path="/patient/upload/:type" element={<UploadFlow />} />
          <Route path="/patient/doc-upload" element={<DocUpload />} />
          <Route path="/patient/doc-upload/:type" element={<DocUpload />} />
          <Route path="/patient/notification/:requestId" element={<NotificationAction />} />
          <Route path="/patient/book" element={<BookMain />} />
          <Route path="/patient/extra-doctors" element={<ExtraDoctors />} />
          <Route path="/patient/service/:slug" element={<ServicePlaceholder />} />
          <Route path="/patient/support" element={<Support />} />
          <Route path="/patient/profile" element={<Profile />} />

          {/* Doctor surface */}
          <Route path="/doctor/patients" element={<PatientList />} />
          <Route path="/doctor/patients/:patientId" element={<PatientRecord />} />

          {/* Admin surface (aggregate-only, no PII) */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/access" element={<AdminAccessAudit />} />
          <Route path="/admin/kpi/:kpiId" element={<AdminDrillDown />} />

          {/* Dev-only routes — stripped from production builds (ENG-09 env-gate) */}
          {DEMO_MODE && (
            <>
              {/* live API smoke test (isolated from the demo) */}
              <Route path="/dev/api-check" element={<ApiCheck />} />
              {/* PWA recovery — unregister stale SW + clear caches */}
              <Route path="/dev/pwa-reset" element={<PwaReset />} />
            </>
          )}

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/patient/entry/welcome" replace />} />
        </Routes>
       </WebAuthGate>
      </OnboardingGate>
      </PatientAuthGate>
      <DevChrome />
      <ToastHost />
    </BrowserRouter>
  )
}

/**
 * Dev/PWA chrome mounted below the routed app.
 *
 * - DemoToolbar is HIDDEN when running as an installed PWA (standalone), so an
 *   installed patient app cannot teleport to /doctor or /admin outside the
 *   manifest's /patient/ scope. In a normal browser tab it behaves exactly as
 *   before.
 * - InstallPrompt is patient-route-gated internally and only appears once the
 *   browser signals installability.
 */
function DevChrome() {
  const standalone = useIsStandalone()
  return (
    <>
      {/* Role-switcher is a demo backdoor — gated out of production builds
          (ENG-09) and still hidden inside an installed PWA. */}
      {DEMO_MODE && !standalone && <DemoToolbar />}
      <InstallPrompt />
    </>
  )
}
