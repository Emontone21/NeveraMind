import { useState } from 'react'
import ExpiryBadge from './ExpiryBadge'

export default function InventoryCard({
  item,
  onStatusToggle,
  onQuantityChange,
  onExpiryChange,
  onDelete,
}) {
  const [editing, setEditing] = useState(false)
  const [qty, setQty] = useState(String(item.quantity))
  const [editingExpiry, setEditingExpiry] = useState(false)
  const [expiryValue, setExpiryValue] = useState(item.expires_at ?? '')
  const [deleting, setDeleting] = useState(false)

  const isConsumed = item.status === 'consumido'

  function handleQtyBlur() {
    const parsed = parseFloat(qty)
    if (!isNaN(parsed) && parsed !== parseFloat(item.quantity)) {
      onQuantityChange(item.id, parsed)
    }
    setEditing(false)
  }

  function handleExpiryCommit() {
    setEditingExpiry(false)
    // Only call onChange if the value actually changed
    const newVal = expiryValue || null
    const oldVal = item.expires_at || null
    if (newVal !== oldVal) {
      onExpiryChange?.(item.id, newVal)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete(item.id)
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div
      className={`card flex items-center gap-3 transition-opacity duration-300 ${
        isConsumed ? 'opacity-50' : ''
      } ${deleting ? 'opacity-0 scale-95 pointer-events-none' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm truncate ${isConsumed ? 'line-through text-brand-400' : 'text-brand-900'}`}>
          {item.name}
        </p>

        <div className="flex items-center gap-1 mt-0.5">
          {editing ? (
            <input
              type="number"
              className="w-20 text-sm bg-brand-50 border border-brand-300 rounded-lg px-2 py-0.5 focus:outline-none focus:border-brand-500"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onBlur={handleQtyBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleQtyBlur()}
              autoFocus
              min="0"
            />
          ) : (
            <button
              onClick={() => { setQty(String(item.quantity)); setEditing(true) }}
              className="text-sm text-brand-600 font-medium hover:text-brand-800 transition-colors"
            >
              {parseFloat(item.quantity) % 1 === 0
                ? parseInt(item.quantity)
                : parseFloat(item.quantity).toFixed(2)}
            </button>
          )}
          <span className="text-xs text-brand-400">{item.unit}</span>
        </div>

        {/* Expiry row — editable inline. Hidden for consumed items. */}
        {!isConsumed && (
          <div className="mt-1.5">
            {editingExpiry ? (
              <input
                type="date"
                className="text-xs bg-brand-50 border border-brand-300 rounded-lg px-2 py-1 focus:outline-none focus:border-brand-500"
                value={expiryValue ?? ''}
                onChange={(e) => setExpiryValue(e.target.value)}
                onBlur={handleExpiryCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleExpiryCommit()
                  if (e.key === 'Escape') {
                    setExpiryValue(item.expires_at ?? '')
                    setEditingExpiry(false)
                  }
                }}
                autoFocus
              />
            ) : (
              <ExpiryBadge
                item={item}
                onClick={() => {
                  setExpiryValue(item.expires_at ?? '')
                  setEditingExpiry(true)
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onStatusToggle(item.id, isConsumed ? 'disponible' : 'consumido')}
          className={`badge transition-colors ${
            isConsumed
              ? 'bg-brand-100 text-brand-500 border border-brand-200'
              : 'bg-brand-500 text-white'
          }`}
        >
          {isConsumed ? 'Consumido' : 'Disponible'}
        </button>

        <button
          onClick={handleDelete}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 active:scale-90 transition-all"
          aria-label="Eliminar"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}
