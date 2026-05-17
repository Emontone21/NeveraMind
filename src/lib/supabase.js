import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (import.meta.env.DEV) {
  console.log('[NeveraMind] Supabase URL defined:', !!supabaseUrl)
  console.log('[NeveraMind] Supabase Key defined:', !!supabaseAnonKey)
  if (!supabaseUrl || supabaseUrl === 'MISSING_URL') {
    console.error('[NeveraMind] VITE_SUPABASE_URL is not set — check GitHub Secrets')
  }
  if (!supabaseAnonKey || supabaseAnonKey === 'MISSING_KEY') {
    console.error('[NeveraMind] VITE_SUPABASE_ANON_KEY is not set — check GitHub Secrets')
  }
}

// Guard: don't call createClient with empty values (throws and crashes the app)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

export async function getInventory() {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Normalise an expires_at input. Accepts:
//   - 'YYYY-MM-DD' or any ISO date string → kept as 'YYYY-MM-DD'
//   - Date instance                         → converted to 'YYYY-MM-DD'
//   - falsy (null/undefined/'')             → null
function normalizeExpiresAt(value) {
  if (!value) return null
  if (value instanceof Date) {
    if (isNaN(value)) return null
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
    return m ? m[1] : null
  }
  return null
}

export async function upsertItem(name, quantity, unit, expiresAt = null) {
  if (!name || !String(name).trim()) throw new Error('El nombre del producto es requerido')
  const parsedQty = parseFloat(quantity)
  if (isNaN(parsedQty) || parsedQty < 0) throw new Error('La cantidad debe ser un número mayor o igual a 0')
  const normalizedName = name.trim().toLowerCase().slice(0, 200)
  const expiry = normalizeExpiresAt(expiresAt)

  const { data: existing } = await supabase
    .from('inventory_items')
    .select('*')
    .ilike('name', normalizedName)
    .single()

  if (existing) {
    const newQty = parseFloat(existing.quantity) + parseFloat(quantity)
    // When merging, keep the EARLIEST expiry date — conservative, avoids
    // forgetting an older batch that's about to go bad.
    const mergedExpiry = (() => {
      if (!expiry) return existing.expires_at
      if (!existing.expires_at) return expiry
      return expiry < existing.expires_at ? expiry : existing.expires_at
    })()
    const { data, error } = await supabase
      .from('inventory_items')
      .update({
        quantity: newQty,
        status: 'disponible',
        expires_at: mergedExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      name: name.trim(),
      quantity: parseFloat(quantity),
      unit: unit.trim(),
      status: 'disponible',
      expires_at: expiry,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function addItem(name, quantity, unit, expiresAt = null) {
  if (!name || !String(name).trim()) throw new Error('El nombre del producto es requerido')
  const parsedQty = parseFloat(quantity)
  if (isNaN(parsedQty) || parsedQty < 0) throw new Error('La cantidad debe ser un número mayor o igual a 0')
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      name: name.trim(),
      quantity: parseFloat(quantity),
      unit: unit.trim(),
      status: 'disponible',
      expires_at: normalizeExpiresAt(expiresAt),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateItemStatus(id, status) {
  const { data, error } = await supabase
    .from('inventory_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateItemQuantity(id, quantity) {
  if (!id) throw new Error('ID de item requerido')
  const parsed = parseFloat(quantity)
  if (isNaN(parsed)) throw new Error('La cantidad debe ser un número válido')
  const status = parsed <= 0 ? 'consumido' : 'disponible'
  const { data, error } = await supabase
    .from('inventory_items')
    .update({ quantity: Math.max(0, parseFloat(quantity)), status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateItemExpiry(id, expiresAt) {
  if (!id) throw new Error('ID de item requerido')
  const expiry = normalizeExpiresAt(expiresAt)
  const { data, error } = await supabase
    .from('inventory_items')
    .update({ expires_at: expiry, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteItem(id) {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id)
  if (error) throw error
}

export async function deductIngredients(ingredients) {
  if (!Array.isArray(ingredients)) throw new Error('ingredients debe ser un array')
  const updates = []
  for (const ing of ingredients) {
    if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) continue
    const qty = parseFloat(ing.quantity)
    if (isNaN(qty)) continue
    const { data: matches } = await supabase
      .from('inventory_items')
      .select('*')
      .ilike('name', ing.name.trim())
      .eq('status', 'disponible')

    if (matches && matches.length > 0) {
      const item = matches[0]
      const newQty = Math.max(0, parseFloat(item.quantity) - qty)
      const status = newQty <= 0 ? 'consumido' : 'disponible'
      const { data, error } = await supabase
        .from('inventory_items')
        .update({ quantity: newQty, status, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .select()
        .single()
      if (error) throw error
      updates.push(data)
    }
  }
  return updates
}
