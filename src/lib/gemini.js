// All Gemini calls are routed through the supabase/functions/gemini-proxy
// Edge Function. GEMINI_API_KEY lives only in Supabase secrets — never in
// the client bundle.

import { supabase } from './supabase.js'

// Accepts raw base64 string (Capacitor) or data URL (file input).
// Image processing stays client-side so we only send the base64 payload.
function normaliseImage(input, mimeTypeHint) {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      const [header, data] = input.split(',')
      const mime = header.match(/:(.*?);/)?.[1] || mimeTypeHint || 'image/jpeg'
      return { base64: data, mimeType: mime }
    }
    return { base64: input, mimeType: mimeTypeHint || 'image/jpeg' }
  }
  throw new Error('normaliseImage: expected string (base64 or data URL)')
}

async function invoke(action, payload) {
  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: { action, ...payload },
  })
  if (error) throw new Error(error.message || 'Error al conectar con el servidor')
  if (data?.error) throw new Error(data.error)
  return data
}

// Returns [{ name, quantity, unit }]
export async function parseReceipt(imageInput, mimeType) {
  const { base64, mimeType: resolvedMime } = normaliseImage(imageInput, mimeType)
  return invoke('parse-receipt', { imageBase64: base64, mimeType: resolvedMime })
}

// Returns [{ meal, ingredients }] or { noIngredients: true }
export async function getRecipeSuggestions(availableItems, filter) {
  return invoke('get-recipe-suggestions', { items: availableItems, filter })
}

// Returns [{ meal, ingredients }] or { noIngredients: true }
export async function getGeneralSuggestions(availableItems) {
  return invoke('get-general-suggestions', { items: availableItems })
}
