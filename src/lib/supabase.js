import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getInventory() {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function upsertItem(name, quantity, unit) {
  const normalizedName = name.trim().toLowerCase()

  const { data: existing } = await supabase
    .from('inventory_items')
    .select('*')
    .ilike('name', normalizedName)
    .single()

  if (existing) {
    const newQty = parseFloat(existing.quantity) + parseFloat(quantity)
    const { data, error } = await supabase
      .from('inventory_items')
      .update({
        quantity: newQty,
        status: 'disponible',
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
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function addItem(name, quantity, unit) {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      name: name.trim(),
      quantity: parseFloat(quantity),
      unit: unit.trim(),
      status: 'disponible',
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
  const status = parseFloat(quantity) <= 0 ? 'consumido' : 'disponible'
  const { data, error } = await supabase
    .from('inventory_items')
    .update({ quantity: Math.max(0, parseFloat(quantity)), status, updated_at: new Date().toISOString() })
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
  const updates = []
  for (const ing of ingredients) {
    const { data: matches } = await supabase
      .from('inventory_items')
      .select('*')
      .ilike('name', ing.name.trim())
      .eq('status', 'disponible')

    if (matches && matches.length > 0) {
      const item = matches[0]
      const newQty = Math.max(0, parseFloat(item.quantity) - parseFloat(ing.quantity))
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
