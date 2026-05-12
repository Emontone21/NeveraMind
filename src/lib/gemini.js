import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY

if (import.meta.env.DEV) {
  console.log('[NeveraMind] Gemini API key defined:', !!apiKey)
  if (!apiKey) {
    console.error('[NeveraMind] VITE_GEMINI_API_KEY is not set — check GitHub Secrets')
  }
}

const genAI = new GoogleGenerativeAI(apiKey || 'placeholder-key')

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Accepts either:
 *   - a raw base64 string (Capacitor Camera: photo.base64String)
 *   - a data URL with prefix (legacy File input: "data:image/jpeg;base64,...")
 * Returns { base64, mimeType }
 */
function normaliseImage(input, mimeTypeHint) {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      // data URL — strip prefix
      const [header, data] = input.split(',')
      const mime = header.match(/:(.*?);/)?.[1] || mimeTypeHint || 'image/jpeg'
      return { base64: data, mimeType: mime }
    }
    // Already raw base64
    return { base64: input, mimeType: mimeTypeHint || 'image/jpeg' }
  }
  throw new Error('normaliseImage: expected string (base64 or data URL)')
}

function extractJSON(text) {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) return objectMatch[0]
  return text.trim()
}

// Parses a Gemini recipe response into either { noIngredients: true } or a
// normalized array of suggestions. Throws on malformed output.
function parseRecipesResponse(text) {
  const jsonStr = extractJSON(text)
  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('Gemini devolvió una respuesta que no pudo interpretarse. Intentá de nuevo.')
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.noIngredients === true) {
    return { noIngredients: true }
  }

  if (!Array.isArray(parsed)) throw new Error('Respuesta inesperada de Gemini')

  return parsed.map((s) => ({
    meal: String(s.meal || '').trim(),
    ingredients: (s.ingredients || []).map((ing) => ({
      name: String(ing.name || '').trim(),
      quantity: parseFloat(ing.quantity) || 1,
      unit: String(ing.unit || 'unidades').trim(),
    })),
  }))
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * parseReceipt(imageInput, mimeType?)
 *
 * imageInput: raw base64 string from Capacitor OR data URL from <input type="file">
 * mimeType:   e.g. 'image/jpeg' — used when imageInput is raw base64
 */
export async function parseReceipt(imageInput, mimeType) {
  if (!apiKey) throw new Error('Gemini API key no configurada')

  const { base64, mimeType: resolvedMime } = normaliseImage(imageInput, mimeType)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `Sos un analizador de tickets de supermercado. Extraé todos los artículos de comida y almacén de esta imagen de ticket. Para cada artículo devolvé: name (nombre en español), quantity (número), y unit (kg, g, L, ml, unidades, etc). Devolvé SOLO un array JSON como: [{ "name": string, "quantity": number, "unit": string }]. Si la cantidad no es clara, poné 1 como valor predeterminado en unit. No incluyas productos de limpieza, higiene personal ni artículos no alimentarios.`

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: resolvedMime, data: base64 } },
  ])

  const text = result.response.text()
  const jsonStr = extractJSON(text)

  let items
  try {
    items = JSON.parse(jsonStr)
  } catch {
    throw new Error('Gemini devolvió una respuesta que no pudo interpretarse. Intentá con otra foto.')
  }

  if (!Array.isArray(items)) throw new Error('Respuesta inesperada de Gemini')

  return items.map((item) => ({
    name: String(item.name || '').trim(),
    quantity: parseFloat(item.quantity) || 1,
    unit: String(item.unit || 'unidades').trim(),
  }))
}

// Returns an array of up to 3 suggestions, or { noIngredients: true } if the
// available items are insufficient for the requested filter type.
export async function getRecipeSuggestions(availableItems, filter) {
  if (!apiKey) throw new Error('Gemini API key no configurada')
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const ingredientsList = availableItems
    .map((i) => `${i.name} (${i.quantity} ${i.unit})`)
    .join(', ')

  const filterLabel =
    filter === 'proteico'
      ? 'Proteico (rico en proteínas, ej: carnes, huevos, legumbres)'
      : filter === 'vegetariano'
      ? 'Vegetariano (sin carnes ni pescados)'
      : filter === 'carbohidratos'
      ? 'Carbohidratos (rico en carbohidratos, ej: arroz, pastas, pan)'
      : 'Sin filtro (cualquier tipo de comida)'

  const prompt = `Sos un asistente de cocina estricto. Tenés disponibles estos ingredientes: ${ingredientsList}.

Tu tarea: sugerí exactamente 3 ideas de comidas en español que se puedan preparar con esos ingredientes. Filtro solicitado: ${filterLabel}.

REGLAS:
- Solo usá ingredientes de la lista proporcionada. No inventes ni agregues ingredientes extra.
- Evaluá si los ingredientes disponibles son realmente suficientes para preparar al menos una comida del tipo solicitado. Si NO lo son (por ejemplo: el filtro es proteico pero no hay ninguna fuente de proteína, o la lista está vacía, o los ingredientes no permiten armar ningún plato real del tipo pedido), respondé ÚNICAMENTE con el objeto JSON: {"noIngredients": true}
- Si SÍ hay ingredientes suficientes, respondé ÚNICAMENTE con un array JSON de exactamente 3 sugerencias: [{ "meal": string, "ingredients": [{ "name": string, "quantity": number, "unit": string }] }]
- No incluyas pasos de cocción, explicaciones ni ningún texto fuera del JSON.`

  const result = await model.generateContent(prompt)
  return parseRecipesResponse(result.response.text())
}

// Returns an array of up to 3 suggestions with no type filter, or
// { noIngredients: true } if the available items can't make any real meal.
export async function getGeneralSuggestions(availableItems) {
  if (!apiKey) throw new Error('Gemini API key no configurada')
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const ingredientsList = availableItems
    .map((i) => `${i.name} (${i.quantity} ${i.unit})`)
    .join(', ')

  const prompt = `Sos un asistente de cocina estricto. Tenés disponibles estos ingredientes: ${ingredientsList}.

Tu tarea: sugerí hasta 3 comidas realistas en español que se puedan preparar con esos ingredientes, sin restricción de tipo.

REGLAS:
- Solo usá ingredientes de la lista proporcionada. No inventes ni agregues ingredientes extra.
- Evaluá si los ingredientes son suficientes para armar alguna comida real. Si son completamente insuficientes (por ejemplo: lista vacía, solo agua, solo condimentos sin base alimenticia real), respondé ÚNICAMENTE con el objeto JSON: {"noIngredients": true}
- Si hay ingredientes suficientes, respondé ÚNICAMENTE con un array JSON de hasta 3 sugerencias: [{ "meal": string, "ingredients": [{ "name": string, "quantity": number, "unit": string }] }]
- No incluyas pasos de cocción, explicaciones ni ningún texto fuera del JSON.`

  const result = await model.generateContent(prompt)
  return parseRecipesResponse(result.response.text())
}
