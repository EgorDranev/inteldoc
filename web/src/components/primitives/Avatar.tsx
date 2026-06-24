interface AvatarProps {
  name: string
  size?: number
  className?: string
}

/**
 * Initials-on-blue avatar. Designed to match the patient app's
 * "slate-blue initials on --blue-100" convention from the brand spec.
 */
export default function Avatar({ name, size = 40, className = '' }: AvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <div
      className={`flex items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 font-bold ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials || '?'}
    </div>
  )
}
