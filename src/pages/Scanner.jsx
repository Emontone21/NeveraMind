import { useState, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { parseReceipt } from '../lib/gemini'
import { upsertItem } from '../lib/supabase'
import { useToast } from '../context/AppContext'
import Spinner from '../components/Spinner'

const IS_NATIVE = Capacitor.isNativePlatform()

export default function Scanner({ onInventoryUpdate }) {
  const [phase, setPhase] = useState('upload') // upload | preview | review | loading
  const [previewUrl, setPreviewUrl] = useState(null)   // for <img src>
  const [capturedB64, setCapturedB64] = useState(null) // raw base64 (no prefix)
  const [capturedMime, setCapturedMime] = useState('image/jpeg')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualQty, setManualQty] = useState('1')
  const [manualUnit, setManualUnit] = useState('unidades')
  const fileRef = useRef(null)
  const { addToast } = useToast()

  // ─── Native: Capacitor Camera ───────────────────────────────────────────────
  async function handleNativePhoto() {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,   // sheet: "Tomar foto" or "Elegir de galería"
        quality: 85,
        allowEditing: false,
        correctOrientation: true,
      })
      const mime = `image/${photo.format || 'jpeg'}`
      setCapturedB64(photo.base64String)
      setCapturedMime(mime)
      setPreviewUrl(`data:${mime};base64,${photo.base64String}`)
      setPhase('preview')
    } catch (err) {
      // User pressed Cancel — not an error
      const msg = err?.message || String(err)
      if (/cancel|dismiss/i.test(msg)) return
      console.error('[Scanner] Camera error:', err)
      addToast('Error al acceder a la cámara: ' + msg, 'error')
    }
  }

  // ─── Web fallback: <input type="file"> ─────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return

    const MAX_SIZE_MB = 10
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      addToast(`La imagen no puede superar los ${MAX_SIZE_MB} MB`, 'error')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    if (!file.type.startsWith('image/')) {
      addToast('Solo se aceptan imágenes (JPG, PNG, WEBP)', 'error')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    const mime = file.type || 'image/jpeg'
    setCapturedMime(mime)
    setPreviewUrl(URL.createObjectURL(file))
    // Convert File → base64 so Gemini always gets the same format
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = reader.result.split(',')[1]
      setCapturedB64(b64)
    }
    reader.readAsDataURL(file)
    setPhase('preview')
  }

  // ─── OCR via Gemini ─────────────────────────────────────────────────────────
  async function handleScan() {
    if (!capturedB64) return
    setLoading(true)
    setPhase('loading')
    try {
      const extracted = await parseReceipt(capturedB64, capturedMime)
      if (extracted.length === 0) {
        addToast('No encontré productos en la imagen. Agregá items manualmente.', 'warning')
        setPhase('review')
        setItems([])
      } else {
        setItems(extracted.map((i, idx) => ({ ...i, _id: idx })))
        setPhase('review')
      }
    } catch (err) {
      console.error('[Scanner] parseReceipt error:', err)
      addToast('No pude leer el ticket. Podés agregar los items manualmente.', 'error')
      setPhase('review')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  function updateItem(idx, field, value) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    )
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function addManualItem() {
    if (!manualName.trim()) return
    setItems((prev) => [
      ...prev,
      { name: manualName.trim(), quantity: parseFloat(manualQty) || 1, unit: manualUnit.trim(), _id: Date.now() },
    ])
    setManualName('')
    setManualQty('1')
    setManualUnit('unidades')
  }

  async function handleConfirm() {
    if (items.length === 0) {
      addToast('No hay items para agregar', 'warning')
      return
    }
    setSaving(true)
    try {
      for (const item of items) {
        await upsertItem(item.name, item.quantity, item.unit)
      }
      addToast(`✓ ${items.length} producto${items.length !== 1 ? 's' : ''} agregado${items.length !== 1 ? 's' : ''} al inventario`)
      onInventoryUpdate?.()
      resetAll()
    } catch (err) {
      console.error(err)
      addToast('Error al guardar los items. Intentá de nuevo.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function resetAll() {
    setPhase('upload')
    setPreviewUrl(null)
    setCapturedB64(null)
    setCapturedMime('image/jpeg')
    setItems([])
    if (fileRef.current) fileRef.current.value = ''
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <header className="pt-2 pb-1">
        <h1 className="text-2xl font-bold text-brand-800">Escaneá tu factura</h1>
        <p className="text-brand-400 text-sm mt-0.5">Sacá una foto de tu ticket de supermercado</p>
      </header>

      {phase === 'upload' && (
        IS_NATIVE
          ? <NativeUploadZone onPress={handleNativePhoto} />
          : <WebUploadZone fileRef={fileRef} onChange={handleFileChange} />
      )}

      {phase === 'preview' && (
        <div className="flex flex-col gap-4">
          <div className="card overflow-hidden p-0">
            <img
              src={previewUrl}
              alt="Ticket"
              className="w-full max-h-72 object-contain bg-brand-50"
            />
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={resetAll}>
              Cambiar imagen
            </button>
            <button className="btn-primary flex-1" onClick={handleScan}>
              Analizar ticket
            </button>
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <Spinner message="Leyendo tu factura con IA..." />
      )}

      {phase === 'review' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-brand-800">
              {items.length > 0 ? `${items.length} productos encontrados` : 'Agregá los productos manualmente'}
            </h2>
            <button className="btn-ghost text-xs" onClick={resetAll}>
              Nueva foto
            </button>
          </div>

          {items.length > 0 && (
            <div className="flex flex-col gap-2">
              {items.map((item, idx) => (
                <ReviewItem
                  key={item._id}
                  item={item}
                  onChange={(field, val) => updateItem(idx, field, val)}
                  onRemove={() => removeItem(idx)}
                />
              ))}
            </div>
          )}

          <AddManualItem
            name={manualName}
            qty={manualQty}
            unit={manualUnit}
            onNameChange={setManualName}
            onQtyChange={setManualQty}
            onUnitChange={setManualUnit}
            onAdd={addManualItem}
          />

          <button
            className="btn-primary w-full"
            onClick={handleConfirm}
            disabled={saving || items.length === 0}
          >
            {saving ? 'Guardando...' : 'Confirmar y agregar al inventario'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Upload zone: native (Capacitor) ──────────────────────────────────────────
function NativeUploadZone({ onPress }) {
  return (
    <button
      onClick={onPress}
      className="card flex flex-col items-center justify-center gap-4 py-12 border-2 border-dashed border-brand-200 bg-brand-50 w-full active:bg-brand-100 transition-colors"
    >
      <span className="text-5xl">📷</span>
      <div className="text-center">
        <p className="font-semibold text-brand-700">Tocá para escanear tu ticket</p>
        <p className="text-brand-400 text-sm mt-1">Usá la cámara o elegí desde tu galería</p>
      </div>
      <span className="btn-primary pointer-events-none">Abrir cámara</span>
    </button>
  )
}

// ─── Upload zone: web (file input fallback) ────────────────────────────────────
function WebUploadZone({ fileRef, onChange }) {
  return (
    <label className="card flex flex-col items-center justify-center gap-4 py-12 border-2 border-dashed border-brand-200 bg-brand-50 cursor-pointer active:bg-brand-100 transition-colors">
      <span className="text-5xl">📷</span>
      <div className="text-center">
        <p className="font-semibold text-brand-700">Tocá para subir tu ticket</p>
        <p className="text-brand-400 text-sm mt-1">JPG, PNG o WEBP • Hasta 10 MB</p>
      </div>
      <span className="btn-primary pointer-events-none">Elegir imagen</span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onChange}
      />
    </label>
  )
}

// ─── Review / edit extracted items ────────────────────────────────────────────
function ReviewItem({ item, onChange, onRemove }) {
  return (
    <div className="card flex items-center gap-2 py-3">
      <div className="flex-1 min-w-0">
        <input
          className="input-field text-sm py-2 mb-1"
          value={item.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="Nombre del producto"
        />
        <div className="flex gap-2">
          <input
            type="number"
            className="input-field text-sm py-2 w-24"
            value={item.quantity}
            onChange={(e) => onChange('quantity', e.target.value)}
            min="0"
            step="0.1"
          />
          <input
            className="input-field text-sm py-2 flex-1"
            value={item.unit}
            onChange={(e) => onChange('unit', e.target.value)}
            placeholder="unidad"
          />
        </div>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-red-400 hover:bg-red-50 active:scale-90 transition-all"
      >
        ✕
      </button>
    </div>
  )
}

// ─── Add item manually ─────────────────────────────────────────────────────────
function AddManualItem({ name, qty, unit, onNameChange, onQtyChange, onUnitChange, onAdd }) {
  return (
    <div className="card border-dashed border-2 border-brand-200 bg-brand-50">
      <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-3">
        + Agregar item manualmente
      </p>
      <div className="flex flex-col gap-2">
        <input
          className="input-field text-sm py-2"
          placeholder="Nombre del producto"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        />
        <div className="flex gap-2">
          <input
            type="number"
            className="input-field text-sm py-2 w-24"
            placeholder="Cant."
            value={qty}
            onChange={(e) => onQtyChange(e.target.value)}
            min="0"
            step="0.1"
          />
          <input
            className="input-field text-sm py-2 flex-1"
            placeholder="unidades"
            value={unit}
            onChange={(e) => onUnitChange(e.target.value)}
          />
        </div>
        <button className="btn-secondary w-full text-sm py-2" onClick={onAdd}>
          Agregar
        </button>
      </div>
    </div>
  )
}
