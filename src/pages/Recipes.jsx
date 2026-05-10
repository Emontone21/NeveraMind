import { useState } from 'react'
import { getInventory, deductIngredients } from '../lib/supabase'
import { getRecipeSuggestions } from '../lib/gemini'
import { useToast } from '../context/AppContext'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'

const FILTERS = [
  { id: 'sin_filtro', label: 'Sin filtro', icon: '🍽️' },
  { id: 'proteico', label: 'Proteico', icon: '🥩' },
  { id: 'vegetariano', label: 'Vegetariano', icon: '🥗' },
  { id: 'carbohidratos', label: 'Carbohidratos', icon: '🍝' },
]

export default function Recipes({ onInventoryUpdate }) {
  const [filter, setFilter] = useState('sin_filtro')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [cooking, setCooking] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const { addToast } = useToast()

  async function handleGetSuggestions() {
    setLoading(true)
    setHasSearched(true)
    setSuggestions([])
    try {
      const allItems = await getInventory()
      const available = allItems.filter((i) => i.status === 'disponible')
      if (available.length === 0) {
        addToast('No tenés ingredientes disponibles en tu inventario', 'warning')
        setLoading(false)
        return
      }
      const results = await getRecipeSuggestions(available, filter)
      setSuggestions(results)
    } catch (err) {
      console.error(err)
      addToast('Error al obtener sugerencias. Intentá de nuevo.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleCook(suggestion) {
    setCooking(suggestion.meal)
    try {
      await deductIngredients(suggestion.ingredients)
      addToast(`✓ Ingredientes de "${suggestion.meal}" descontados del inventario`)
      onInventoryUpdate?.()
      setSuggestions([])
      setHasSearched(false)
    } catch (err) {
      console.error(err)
      addToast('Error al descontar los ingredientes', 'error')
    } finally {
      setCooking(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="pt-2">
        <h1 className="text-2xl font-bold text-brand-800">¿Qué cocino hoy?</h1>
        <p className="text-brand-400 text-sm mt-0.5">Te sugerimos recetas con lo que tenés disponible</p>
      </header>

      <div className="card flex flex-col gap-3">
        <p className="text-sm font-semibold text-brand-700">Elegí un filtro:</p>
        <div className="grid grid-cols-2 gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-2 px-3 py-3 rounded-2xl border-2 text-sm font-medium transition-all active:scale-95 ${
                filter === f.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-brand-100 bg-white text-brand-500'
              }`}
            >
              <span className="text-xl">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>
        <button
          className="btn-primary w-full"
          onClick={handleGetSuggestions}
          disabled={loading}
        >
          {loading ? 'Buscando ideas...' : '¿Qué cocino hoy? 🍳'}
        </button>
      </div>

      {loading && <Spinner message="Pensando ideas con tu inventario..." />}

      {!loading && hasSearched && suggestions.length === 0 && (
        <EmptyState
          icon="😅"
          title="No encontré sugerencias"
          subtitle="Probá con otro filtro o agregá más ingredientes a tu inventario"
        />
      )}

      {!loading && suggestions.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-brand-700 text-sm">
            3 ideas para hoy:
          </h2>
          {suggestions.map((s, idx) => (
            <RecipeCard
              key={idx}
              suggestion={s}
              onCook={handleCook}
              isCooking={cooking === s.meal}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RecipeCard({ suggestion, onCook, isCooking }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-brand-800 text-base">{suggestion.meal}</h3>
          <p className="text-brand-400 text-xs mt-0.5">
            {suggestion.ingredients.length} ingrediente{suggestion.ingredients.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-brand-400 text-sm font-medium shrink-0 hover:text-brand-600 transition-colors"
        >
          {expanded ? 'Ocultar' : 'Ver ingredientes'}
        </button>
      </div>

      {expanded && (
        <ul className="flex flex-col gap-1.5 border-t border-brand-100 pt-3">
          {suggestion.ingredients.map((ing, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-brand-700">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
              <span className="font-medium">{ing.name}</span>
              <span className="text-brand-400 ml-auto shrink-0">
                {parseFloat(ing.quantity) % 1 === 0
                  ? parseInt(ing.quantity)
                  : parseFloat(ing.quantity).toFixed(1)}{' '}
                {ing.unit}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        className="btn-primary w-full text-sm py-2.5"
        onClick={() => onCook(suggestion)}
        disabled={isCooking}
      >
        {isCooking ? 'Cocinando...' : '👨‍🍳 Voy a cocinar esto'}
      </button>
    </div>
  )
}
