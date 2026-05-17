import { expiryBucket, expiryLabel } from '../lib/expiry'

// Color per bucket. Tailwind classes are listed explicitly (no string-interp)
// so the JIT compiler picks them up.
const STYLES = {
  expired:  'bg-red-100 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
  soon:     'bg-orange-100 text-orange-700 border-orange-200',
  week:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  ok:       'bg-brand-50 text-brand-600 border-brand-200',
}

export default function ExpiryBadge({ item, onClick, compact = false }) {
  const bucket = expiryBucket(item)
  const label = expiryLabel(item)

  if (!bucket) {
    // No expiry set — show a subtle "+ fecha" affordance if onClick is provided
    if (!onClick) return null
    return (
      <button
        onClick={onClick}
        className="text-[11px] text-brand-400 hover:text-brand-600 underline-offset-2 hover:underline transition-colors"
      >
        + fecha de vencimiento
      </button>
    )
  }

  const className = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${STYLES[bucket]} ${
    onClick ? 'cursor-pointer hover:opacity-80' : ''
  }`

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={className}
      aria-label={label}
    >
      {bucket === 'expired' || bucket === 'critical' ? '⚠️' : '🗓️'}
      {!compact && <span>{label}</span>}
      {compact && <span>{shortLabel(item)}</span>}
    </button>
  )
}

function shortLabel(item) {
  const d = (() => {
    const v = item?.expires_at
    if (!v) return null
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    return `${m[3]}/${m[2]}`
  })()
  return d ?? ''
}
