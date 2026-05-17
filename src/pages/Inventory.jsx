import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getInventory,
  addItem,
  updateItemStatus,
  updateItemQuantity,
  updateItemExpiry,
  deleteItem,
} from '../lib/supabase'
import { selectExpiring, daysFromNowIso, defaultExpiryDays } from '../lib/expiry'
import {
  requestPermissions as requestNotifPermissions,
  syncNotifications,
  scheduleExpiryNotification,
  cancelNotificationForItem,
} from '../lib/notifications'
import { useToast } from '../context/AppContext'
import InventoryCard from '../components/InventoryCard'
import ExpiryBadge from '../components/ExpiryBadge'
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
  const [newExpiry, setNewExpiry] = useState('')
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()
  const permissionAsked = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getInventory()
      setItems(data)
      // Reconcile local notifications with whatever's in the DB
      syncNotifications(data).catch(() => {})
    } catch (err) {
      console.error(err)
      addToast('Error al cargar el inventario', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load, refreshKey])

  // Ask for notification permission the first time the user has anything
  // with an expiry. Avoids the iOS dialog popping up on a cold install.
  useEffect(() => {
    if (permissionAsked.current) return
    const hasAnyExpiry = items.some((i) => i.expires_at && i.status === 'disponible')
    if (!hasAnyExpiry) return
    permissionAsked.current = true
    requestNotifPermissions().catch(() => {})
  }, [items])

  async function handleStatusToggle(id, newStatus) {
    try {
      const updated = await updateItemStatus(id, newStatus)
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
      addToast(newStatus === 'consumido' ? '✓ Marcado como consumido' : '✓ Marcado como disponible')
      if (newStatus === 'consumido') {
        cancelNotificationForItem(id).catch(() => {})
      } else {
        scheduleExpiryNotification(updated).catch(() => {})
      }
    } catch {
      addToast('Error al actualizar el item', 'error')
    }
  }

  async function handleQuantityChange(id, qty) {
    try {
      const updated = await updateItemQuantity(id, qty)
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
      addToast('✓ Cantidad actualizada')
      // qty -> 0 marks it consumido in the DB; cancel reminder in that case
      if (updated.status === 'consumido') {
        cancelNotificationForItem(id).catch(() => {})
      }
    } catch {
      addToast('Error al actualizar la cantidad', 'error')
    }
  }

  async function handleExpiryChange(id, expiresAt) {
    try {
      const updated = await updateItemExpiry(id, expiresAt)
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)))
      addToast(expiresAt ? '✓ Fecha de vencimiento actualizada' : '✓ Fecha eliminada')
      if (expiresAt) {
        // Ask permission lazily when the user actually sets a date
        requestNotifPermissions().catch(() => {})
        scheduleExpiryNotification(updated).catch(() => {})
      } else {
        cancelNotificationForItem(id).catch(() => {})
      }
    } catch {
      addToast('Error al actualizar la fecha', 'error')
    }
  }

  async function handleDelete(id) {
    try {
      await deleteItem(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
      addToast('✓ Producto eliminado')
      cancelNotificationForItem(id).catch(() => {})
    } catch {
      addToast('Error al eliminar el producto', 'error')
    }
  }

  async function handleAddItem() {
    if (!newName.trim()) return
    setSaving(true)
    try {
      // If user didn't pick a date, try a heuristic default based on the name
      let expiry = newExpiry || null
      if (!expiry) {
        const days = defaultExpiryDays(newName)
        if (days) expiry = daysFromNowIso(days)
      }
      const item = await addItem(newName, newQty, newUnit, expiry)
      setItems((prev) => [item, ...prev])
      setNewName('')
      setNewQty('1')
      setNewUnit('unidades')
      setNewExpiry('')
      setShowAddForm(false)
      addToast(`✓ "${item.name}" agregado al inventario`)
      if (item.expires_at) {
        requestNotifPermissions().catch(() => {})
        scheduleExpiryNotification(item).catch(() => {})
      }
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

  const expiring = useMemo(() => selectExpiring(items, 3), [items])

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

      {/* Expiring-soon section: only shown when there are items in next 3 days */}
      {expiring.length > 0 && !search && (
        <ExpiringSection
          items={expiring}
          onStatusToggle={handleStatusToggle}
          onQuantityChange={handleQuantityChange}
          onExpiryChange={handleExpiryChange}
          onDelete={handleDelete}
        />
      )}

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
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-brand-500 uppercase tracking-wide">
                Vence el (opcional)
              </span>
              <input
                type="date"
                className="input-field text-sm py-2"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
              />
            </label>
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
              onExpiryChange={handleExpiryChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── "Por vencer pronto" section ──────────────────────────────────────────────
function ExpiringSection({ items, onStatusToggle, onQuantityChange, onExpiryChange, onDelete }) {
  const expiredCount = items.filter((i) => {
    const v = i.expires_at
    if (!v) return false
    return new Date(v) < new Date(new Date().toDateString())
  }).length

  return (
    <section className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-3">
      <header className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">⏰</span>
          <h2 className="font-semibold text-orange-800 text-sm">
            Por vencer pronto
          </h2>
        </div>
        <span className="text-[11px] font-medium text-orange-700 bg-orange-100 rounded-full px-2 py-0.5">
          {items.length} {items.length === 1 ? 'item' : 'items'}
          {expiredCount > 0 && ` · ${expiredCount} vencido${expiredCount > 1 ? 's' : ''}`}
        </span>
      </header>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <InventoryCard
            key={item.id}
            item={item}
            onStatusToggle={onStatusToggle}
            onQuantityChange={onQuantityChange}
            onExpiryChange={onExpiryChange}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  )
}

// Re-export so consumers can pick it up if needed
export { ExpiryBadge }
