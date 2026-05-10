import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY

// Diagnostic
console.log('[NeveraMind] Gemini API key defined:', !!apiKey)

if (!apiKey) {
  console.error('[NeveraMind] VITE_GEMINI_API_KEY is not set — check GitHub Secrets')
}

// Guard: use placeholder so module-level instantiation never throws
const genAI = new GoogleGenerativeAI(apiKey || 'placeholder-key')

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function extractJSON(text) {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  return text.trim()
}

export async function parseReceipt(imageFile) {
  if (!apiKey) throw new Error('Gemini API key no configurada')
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const base64Data = await fileToBase64(imageFile)
  const mimeType = imageFile.type || 'image/jpeg'

  const prompt = `Sos un analizador de tickets de supermercado. Extraé todos los artículos de comida y almacén de esta imagen de ticket. Para cada artículo devolvé: name (nombre en español), quantity (número), y unit (kg, g, L, ml, unidades, etc). Devolvé SOLO un array JSON como: [{ "name": string, "quantity": number, "unit": string }]. Si la cantidad no es clara, poné 1 como valor predeterminado en unit. No incluyas productos de limpieza, higiene personal ni artículos no alimentarios.`

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType, data: base64Data } },
  ])

  const text = result.response.text()
  const jsonStr = extractJSON(text)
  const items = JSON.parse(jsonStr)

  if (!Array.isArray(items)) throw new Error('Respuesta inesperada de Gemini')

  return items.map((item) => ({
    name: String(item.name || '').trim(),
    quantity: parseFloat(item.quantity) || 1,
    unit: String(item.unit || 'unidades').trim(),
  }))
}

export async function getRecipeSuggestions(availableItems, filter) {
  if (!apiKey) throw new Error('Gemini API key no configurada')
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const ingredientsList = availableItems
    .map((i) => `${i.name} (${i.quantity} ${i.unit})`)
    .join(', ')

  const filterLabel =
    filter === 'proteico'
      ? 'Proteico (rico en proteínas)'
      : filter === 'vegetariano'
      ? 'Vegetariano'
      : filter === 'carbohidratos'
      ? 'Carbohidratos (rico en carbohidratos)'
      : 'Sin filtro (cualquier tipo de comida)'

  const prompt = `Sos un asistente de cocina. Basándote en estos ingredientes disponibles: ${ingredientsList}. Sugerí 3 ideas de comidas en español. Filtro: ${filterLabel}. Para cada sugerencia devolvé: meal (nombre del plato), y ingredients (ingredientes necesarios de la lista con sus cantidades). NO escribas recetas completas ni pasos de cocción. Devolvé SOLO un array JSON como: [{ "meal": string, "ingredients": [{ "name": string, "quantity": number, "unit": string }] }].`

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const jsonStr = extractJSON(text)
  const suggestions = JSON.parse(jsonStr)

  if (!Array.isArray(suggestions)) throw new Error('Respuesta inesperada de Gemini')

  return suggestions.map((s) => ({
    meal: String(s.meal || '').trim(),
    ingredients: (s.ingredients || []).map((ing) => ({
      name: String(ing.name || '').trim(),
      quantity: parseFloat(ing.quantity) || 1,
      unit: String(ing.unit || 'unidades').trim(),
    })),
  }))
}
