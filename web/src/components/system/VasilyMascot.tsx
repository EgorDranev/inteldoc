import vasiliySrc from '../../design/vasiliy-mascot.png'

interface VasilyMascotProps {
  size?: number
  /** Show the soft radial halo behind the mascot. */
  halo?: boolean
  className?: string
}

export default function VasilyMascot({
  size = 120,
  halo = false,
  className = '',
}: VasilyMascotProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {halo && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: 'var(--gradient-mascot-halo)' }}
        />
      )}
      <img
        src={vasiliySrc}
        alt=""
        aria-hidden
        draggable={false}
        className="relative h-full w-auto select-none pointer-events-none"
      />
    </div>
  )
}
