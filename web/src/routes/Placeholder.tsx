import PhoneFrame from '../components/patient/PhoneFrame'

interface PlaceholderProps {
  title: string
  hint?: string
}

/**
 * Temporary placeholder so the router compiles before each route is built out.
 * Replaced screen-by-screen in Phases 2–6.
 */
export default function Placeholder({ title, hint }: PlaceholderProps) {
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="h-12 w-12 rounded-full bg-cyan-50 flex items-center justify-center text-cyan-500 text-xl font-bold">
          •
        </div>
        <h1 className="text-h2-ui font-bold text-ink-strong">{title}</h1>
        {hint && <p className="text-caption text-ink-muted">{hint}</p>}
      </div>
    </PhoneFrame>
  )
}
