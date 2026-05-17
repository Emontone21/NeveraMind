// Expiry-date helpers. Pure functions — no I/O, no Supabase.
//
// Date model:
//   - `expires_at` in the DB is a `date` (no time). We treat it as a calendar
//     day in the user's local timezone.
//   - The string format from Postgres is 'YYYY-MM-DD'.

// ─── Parsing & formatting ─────────────────────────────────────────────────────

/**
 * Parse a date value into a JS Date at local midnight, or null.
 * Accepts: Date, 'YYYY-MM-DD', ISO 8601 string, null, undefined.
 */
export function parseExpiry(value) {
  if (!value) return null
  if (value instanceof Date) return isNaN(value) ? null : startOfDay(value)
  if (typeof value !== 'string') return null

  // 'YYYY-MM-DD' → build at local midnight (avoids the UTC-shift trap that
  // `new Date('2026-05-16')` falls into, which interprets it as UTC).
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
    return isNaN(d) ? null : d
  }
  const d = new Date(value)
  return isNaN(d) ? null : startOfDay(d)
}

/** Format a Date as 'YYYY-MM-DD' in local time (for DB storage). */
export function toIsoDate(date) {
  if (!(date instanceof Date) || isNaN(date)) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// ─── Days-until math ──────────────────────────────────────────────────────────

/**
 * Days from today to expiry. Negative = already expired.
 * Returns null when the item has no expiry set.
 */
export function daysUntilExpiry(item, now = new Date()) {
  const expiry = parseExpiry(item?.expires_at)
  if (!expiry) return null
  const today = startOfDay(now)
  const diffMs = expiry.getTime() - today.getTime()
  return Math.round(diffMs / 86_400_000)
}

/**
 * Returns a coarse bucket suitable for badge coloring.
 *   'expired'  → ya pasó
 *   'critical' → ≤ 1 día
 *   'soon'     → ≤ 3 días
 *   'week'     → ≤ 7 días
 *   'ok'       → > 7 días
 *   null       → sin fecha
 */
export function expiryBucket(item, now) {
  const d = daysUntilExpiry(item, now)
  if (d === null) return null
  if (d < 0) return 'expired'
  if (d <= 1) return 'critical'
  if (d <= 3) return 'soon'
  if (d <= 7) return 'week'
  return 'ok'
}

/** Short human label shown on the badge. */
export function expiryLabel(item, now) {
  const d = daysUntilExpiry(item, now)
  if (d === null) return null
  if (d < -1) return `Venció hace ${-d} días`
  if (d === -1) return 'Venció ayer'
  if (d === 0) return 'Vence hoy'
  if (d === 1) return 'Vence mañana'
  return `Vence en ${d} días`
}

// ─── Default-expiry heuristic ─────────────────────────────────────────────────

/**
 * Best-effort default expiry (in days from today) inferred from the product
 * name. Used when Gemini doesn't return a `suggestedExpiryDays` field.
 *
 * Returns null when no rule matches — in that case the UI leaves expiry blank
 * and lets the user set it manually.
 */
export function defaultExpiryDays(name) {
  if (typeof name !== 'string') return null
  const n = name.toLowerCase()

  // ── Carnes / pescados frescos: 3 días ──
  if (/\b(carne|bife|pollo|milanesa|cerdo|chorizo|pescado|salmon|atún|mariscos)\b/.test(n)) {
    return 3
  }
  // ── Pan / panadería: 5 días ──
  if (/\b(pan|baguette|medialun|factur)\b/.test(n)) return 5

  // ── Lácteos frescos: 7 días ──
  if (/\b(leche|yogur|crema|ricota|queso\s+(blanco|crema|untable))\b/.test(n)) {
    return 7
  }
  // ── Quesos duros: 30 días ──
  if (/\b(queso)\b/.test(n)) return 30

  // ── Verduras de hoja: 5 días ──
  if (/\b(lechuga|espinaca|rúcula|acelga|verdura)\b/.test(n)) return 5

  // ── Frutas / verduras generales: 7 días ──
  if (/\b(tomate|manzana|banana|naranja|pera|frutilla|zanahoria|cebolla|papa|pepino|morrón|pimiento)\b/.test(n)) {
    return 7
  }

  // ── Huevos: 21 días ──
  if (/\b(huevo|huevos)\b/.test(n)) return 21

  // ── Fiambres / embutidos: 7 días ──
  if (/\b(jamón|jamon|salchich|paleta|mortadela|salame|fiambre)\b/.test(n)) {
    return 7
  }

  // ── Congelados: 90 días ──
  if (/\b(congelad|hamburgues|nugget|helado)\b/.test(n)) return 90

  // ── Secos / almacén / conservas: 365 días ──
  if (/\b(arroz|fideo|pasta|harina|azúcar|sal|aceite|vinagre|conserva|lata|enlatad|atún en lata)\b/.test(n)) {
    return 365
  }

  return null
}

/**
 * Convert a "days from today" offset to a 'YYYY-MM-DD' string.
 */
export function daysFromNowIso(days) {
  if (typeof days !== 'number' || isNaN(days)) return null
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

// ─── Sorting / filtering ──────────────────────────────────────────────────────

/** Returns items whose expiry is ≤ threshold days away (incl. already expired). */
export function selectExpiring(items, threshold = 3, now = new Date()) {
  return items
    .filter((i) => i.status === 'disponible')
    .filter((i) => {
      const d = daysUntilExpiry(i, now)
      return d !== null && d <= threshold
    })
    .sort((a, b) => daysUntilExpiry(a, now) - daysUntilExpiry(b, now))
}
