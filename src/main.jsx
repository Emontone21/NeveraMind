import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// ─── Env variable check ───────────────────────────────────────────────────────
// In Capacitor/WKWebView the variables are inlined at build time via vite.config.
// If any is missing, show a visible error instead of a blank white screen.
const REQUIRED_ENV = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY,
}

const missingVars = Object.entries(REQUIRED_ENV)
  .filter(([, v]) => !v || v === 'undefined')
  .map(([k]) => k)

if (missingVars.length > 0) {
  document.getElementById('root').innerHTML = `
    <div style="
      position:fixed;inset:0;background:#fff;color:#dc2626;
      font-family:monospace;font-size:14px;
      padding:60px 24px 24px;line-height:1.6;
    ">
      <h2 style="font-size:18px;margin-bottom:12px;">⚠️ Variables de entorno faltantes</h2>
      <p>Las siguientes variables no fueron incluidas en el build:</p>
      <ul style="margin:12px 0 0 16px;">
        ${missingVars.map(v => `<li><code>${v}</code></li>`).join('')}
      </ul>
      <p style="margin-top:16px;color:#6b7280;font-size:12px;">
        Asegurate de que el build se haga con el .env cargado o via GitHub Secrets.
      </p>
    </div>
  `
} else {
  // Register service worker only when running as PWA (not inside Capacitor)
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
