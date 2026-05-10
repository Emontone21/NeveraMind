import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(90vw,380px)]">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  )
}

function Toast({ toast, onRemove }) {
  const bg =
    toast.type === 'error'
      ? 'bg-red-500'
      : toast.type === 'warning'
      ? 'bg-amber-500'
      : 'bg-brand-600'

  return (
    <div
      className={`${bg} text-white px-4 py-3 rounded-2xl shadow-lg flex items-center justify-between gap-3 animate-fade-in`}
      onClick={() => onRemove(toast.id)}
    >
      <span className="text-sm font-medium">{toast.message}</span>
      <span className="text-white/70 text-lg leading-none cursor-pointer select-none">×</span>
    </div>
  )
}
