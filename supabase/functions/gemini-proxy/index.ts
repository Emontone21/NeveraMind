// Supabase Edge Function — gemini-proxy
// Keeps GEMINI_API_KEY server-side. Set it once with:
//   supabase secrets set GEMINI_API_KEY=your-key
// Then deploy with:
//   supabase functions deploy gemini-proxy

import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.24.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── JSON extraction helpers (same logic as the old client-side gemini.js) ─────

function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) return objectMatch[0]
  return text.trim()
}

type Ingredient = { name: string; quantity: number; unit: string }
type Suggestion  = { meal: string; ingredients: Ingredient[] }
type RecipeResult = Suggestion[] | { noIngredients: true }

function parseRecipesResponse(text: string): RecipeResult {
  const jsonStr = extractJSON(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('Gemini devolvió una respuesta que no pudo interpretarse. Intentá de nuevo.')
  }

  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>).noIngredients === true
  ) {
    return { noIngredients: true }
  }

  if (!Array.isArray(parsed)) throw new Error('Respuesta inesperada de Gemini')

  return (parsed as Record<string, unknown>[]).map((s) => ({
    meal: String(s.meal ?? '').trim(),
    ingredients: ((s.ingredients as Record<string, unknown>[]) ?? []).map((ing) => ({
      name:     String(ing.name     ?? '').trim(),
      quantity: parseFloat(String(ing.quantity)) || 1,
      unit:     String(ing.unit     ?? 'unidades').trim(),
    })),
  }))
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return respond({ error: 'GEMINI_API_KEY no configurada en el servidor' }, 500)
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const body = await req.json() as Record<string, unknown>
    const { action } = body

    // ── parse-receipt ────────────────────────────────────────────────────────
    if (action === 'parse-receipt') {
      const { imageBase64, mimeType } = body as { imageBase64: string; mimeType: string }
      if (!imageBase64) return respond({ error: 'imageBase64 requerido' }, 400)

      const prompt =
        'Sos un analizador de tickets de supermercado. Extraé todos los artículos de comida y almacén de esta imagen de ticket. ' +
        'Para cada artículo devolvé: name (nombre en español), quantity (número), y unit (kg, g, L, ml, unidades, etc). ' +
        'Devolvé SOLO un array JSON como: [{ "name": string, "quantity": number, "unit": string }]. ' +
        'Si la cantidad no es clara, poné 1 como valor predeterminado en unit. ' +
        'No incluyas productos de limpieza, higiene personal ni artículos no alimentarios.'

      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: mimeType ?? 'image/jpeg', data: imageBase64 } },
      ])

      const jsonStr = extractJSON(result.response.text())
      let items: unknown
      try {
        items = JSON.parse(jsonStr)
      } catch {
        return respond(
          { error: 'No pudo interpretarse la respuesta de Gemini. Intentá con otra foto.' },
          422,
        )
      }

      if (!Array.isArray(items)) return respond({ error: 'Respuesta inesperada de Gemini' }, 422)

      return respond(
        (items as Record<string, unknown>[]).map((item) => ({
          name:     String(item.name     ?? '').trim(),
          quantity: parseFloat(String(item.quantity)) || 1,
          unit:     String(item.unit     ?? 'unidades').trim(),
        })),
      )
    }

    // ── get-recipe-suggestions ───────────────────────────────────────────────
    if (action === 'get-recipe-suggestions') {
      const { items, filter } = body as {
        items: Record<string, unknown>[];
        filter: string
      }
      if (!Array.isArray(items)) return respond({ error: 'items debe ser un array' }, 400)

      const ingredientsList = items
        .map((i) => `${i.name} (${i.quantity} ${i.unit})`)
        .join(', ')

      const filterLabel =
        filter === 'proteico'      ? 'Proteico (rico en proteínas, ej: carnes, huevos, legumbres)' :
        filter === 'vegetariano'   ? 'Vegetariano (sin carnes ni pescados)' :
        filter === 'carbohidratos' ? 'Carbohidratos (rico en carbohidratos, ej: arroz, pastas, pan)' :
                                     'Sin filtro (cualquier tipo de comida)'

      const prompt =
        `Sos un asistente de cocina estricto. Tenés disponibles estos ingredientes: ${ingredientsList}.\n\n` +
        `Tu tarea: sugerí exactamente 3 ideas de comidas en español que se puedan preparar con esos ingredientes. Filtro solicitado: ${filterLabel}.\n\n` +
        'REGLAS:\n' +
        '- Solo usá ingredientes de la lista proporcionada. No inventes ni agregues ingredientes extra.\n' +
        '- Evaluá si los ingredientes disponibles son realmente suficientes para preparar al menos una comida del tipo solicitado. ' +
        'Si NO lo son, respondé ÚNICAMENTE con el objeto JSON: {"noIngredients": true}\n' +
        '- Si SÍ hay ingredientes suficientes, respondé ÚNICAMENTE con un array JSON de exactamente 3 sugerencias: ' +
        '[{ "meal": string, "ingredients": [{ "name": string, "quantity": number, "unit": string }] }]\n' +
        '- No incluyas pasos de cocción, explicaciones ni ningún texto fuera del JSON.'

      const result = await model.generateContent(prompt)
      return respond(parseRecipesResponse(result.response.text()))
    }

    // ── get-general-suggestions ──────────────────────────────────────────────
    if (action === 'get-general-suggestions') {
      const { items } = body as { items: Record<string, unknown>[] }
      if (!Array.isArray(items)) return respond({ error: 'items debe ser un array' }, 400)

      const ingredientsList = items
        .map((i) => `${i.name} (${i.quantity} ${i.unit})`)
        .join(', ')

      const prompt =
        `Sos un asistente de cocina estricto. Tenés disponibles estos ingredientes: ${ingredientsList}.\n\n` +
        'Tu tarea: sugerí hasta 3 comidas realistas en español que se puedan preparar con esos ingredientes, sin restricción de tipo.\n\n' +
        'REGLAS:\n' +
        '- Solo usá ingredientes de la lista proporcionada. No inventes ni agregues ingredientes extra.\n' +
        '- Evaluá si los ingredientes son suficientes para armar alguna comida real. ' +
        'Si son completamente insuficientes, respondé ÚNICAMENTE con el objeto JSON: {"noIngredients": true}\n' +
        '- Si hay ingredientes suficientes, respondé ÚNICAMENTE con un array JSON de hasta 3 sugerencias: ' +
        '[{ "meal": string, "ingredients": [{ "name": string, "quantity": number, "unit": string }] }]\n' +
        '- No incluyas pasos de cocción, explicaciones ni ningún texto fuera del JSON.'

      const result = await model.generateContent(prompt)
      return respond(parseRecipesResponse(result.response.text()))
    }

    return respond({ error: `Acción desconocida: ${action}` }, 400)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[gemini-proxy]', message)
    return respond({ error: message }, 500)
  }
})
