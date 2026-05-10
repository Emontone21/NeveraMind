import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// ─── Env variable check ───────────────────────────────────────────────────────
const REQUIRED_ENV = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY,
}

const missingVars = Object.entries(REQUIRED_ENV)
  .filter(([, v]) => !v || v === 'undefined' || v === '')
  .map(([k]) => k)

if (missingVars.length > 0) {
  // Show missing vars visibly — covers blank screen when secrets not set in CI
  document.getElementById('root').innerHTML = `
    <div style="
      position:fixed;inset:0;background:#f0fdf4;color:#dc2626;
      font-family:-apple-system,sans-serif;font-size:14px;
      padding:80px 24px 24px;line-height:1.6;box-sizing:border-box;
    ">
      <div style="font-size:40px;margin-bottom:16px;">⚠️</div>
      <h2 style="font-size:18px;margin:0 0 12px;color:#991b1b;">Variables de entorno faltantes</h2>
      <p style="margin:0 0 8px;">El build no incluyó estas variables:</p>
      <ul style="margin:8px 0 0 16px;color:#7f1d1d;">
        ${missingVars.map(v => `<li><code>${v}</code></li>`).join('')}
      </ul>
      <p style="margin-top:16px;color:#6b7280;font-size:12px;">
        Agregá los GitHub Secrets y volvé a triggerear el workflow.
      </p>
    </div>
  `
} else {
  // Only register service worker when running as PWA, not inside Capacitor native
  if ('serviceWorker' in navigator && !window.Capacitor) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}
