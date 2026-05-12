import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getInventory,
  addItem,
  updateItemStatus,
  updateItemQuantity,
  deleteItem,
} from '../lib/supabase'
import { useToast } from '../context/AppContext'
import InventoryCard from '../components/InventoryCard'
import EmptyState from '../components/EmptyState'
import Spinner from '../components/Spinner'

export default function Inventory({ refreshKey }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todos') // todos | disponible | consumido
  const [showAddForm, setShowAddForm] = useState(false)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newUnit, setNewUnit] = useState('unidades')
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getInventory()
      setItems(data)
    } catch (err) {
      console.error(err)
      addToast('Error al cargar el inventario', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load, refreshKey])

  async function handleStatusToggle(id, newStatus) {
    try {
      const updated = await updateItemStatus(id, newStatus)
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
      addToast(newStatus === 'consumido' ? '✓ Marcado como consumido' : '✓ Marcado como disponible')
    } catch {
      addToast('Error al actualizar el item', 'error')
    }
  }

  async function handleQuantityChange(id, qty) {
    try {
      const updated = await updateItemQuantity(id, qty)
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
      addToast('✓ Cantidad actualizada')
    } catch {
      addToast('Error al actualizar la cantidad', 'error')
    }
  }

  async function handleDelete(id) {
    try {
      await deleteItem(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
      addToast('✓ Producto eliminado')
    } catch {
      addToast('Error al eliminar el producto', 'error')
    }
  }

  async function handleAddItem() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const item = await addItem(newName, newQty, newUnit)
      setItems((prev) => [item, ...prev])
      setNewName('')
      setNewQty('1')
      setNewUnit('unidades')
      setShowAddForm(false)
      addToast(`✓ "${item.name}" agregado al inventario`)
    } catch {
      addToast('Error al agregar el producto', 'error')
    } finally {
      setSaving(false)
    }
  }

  const available = useMemo(
    () => items.filter((i) => i.status === 'disponible'),
    [items]
  )

  const filtered = useMemo(
    () =>
      items
        .filter((i) => filter === 'todos' || i.status === filter)
        .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase())),
    [items, filter, search]
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="pt-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-brand-800">Mi inventario</h1>
            <p className="text-brand-500 text-sm mt-0.5">
              {available.length} producto{available.length !== 1 ? 's' : ''} disponible{available.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            className="btn-primary py-2 px-4 text-sm"
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? 'Cancelar' : '+ Agregar'}
          </button>
        </div>
      </header>

      {showAddForm && (
        <div className="card border-dashed border-2 border-brand-300 bg-brand-50">
          <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-3">Nuevo producto</p>
          <div className="flex flex-col gap-2">
            <input
              className="input-field text-sm py-2"
              placeholder="Nombre del producto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
              autoFocus
            />
            <div className="flex gap-2">
              <input
                type="number"
                className="input-field text-sm py-2 w-24"
                placeholder="Cant."
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                min="0"
                step="0.1"
              />
              <input
                className="input-field text-sm py-2 flex-1"
                placeholder="unidades"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
              />
            </div>
            <button className="btn-primary w-full text-sm py-2" onClick={handleAddItem} disabled={saving}>
              {saving ? 'Guardando...' : 'Agregar al inventario'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <input
          className="input-field text-sm py-2"
          placeholder="🔍 Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'disponible', label: 'Disponibles' },
            { id: 'consumido', label: 'Consumidos' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-brand-600 border border-brand-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner message="Cargando inventario..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={search ? '🔍' : '🛒'}
          title={search ? 'Sin resultados' : 'Tu inventario está vacío'}
          subtitle={search ? `No encontramos "${search}"` : 'Escaneá un ticket o agregá productos manualmente'}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <InventoryCard
              key={item.id}
              item={item}
              onStatusToggle={handleStatusToggle}
              onQuantityChange={handleQuantityChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
