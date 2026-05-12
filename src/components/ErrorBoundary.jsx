import { Component } from 'react'

/**
 * Catches any JS crash that would otherwise produce a blank white screen
 * in Capacitor's WKWebView and displays the error visibly for diagnosis.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    // Also log so it shows in Xcode / Safari inspector
    console.error('[NeveraMind ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV
      return (
        <div style={{
          position: 'fixed', inset: 0,
          background: '#fff', color: '#dc2626',
          fontFamily: 'monospace', fontSize: 13,
          padding: '48px 20px 20px', overflowY: 'auto',
          zIndex: 9999,
        }}>
          <h2 style={{ fontSize: 18, marginBottom: 12, color: '#991b1b' }}>
            ⚠️ NeveraMind — Algo salió mal
          </h2>
          {isDev ? (
            <>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: 16 }}>
                {String(this.state.error)}
              </pre>
              {this.state.info && (
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#6b7280', fontSize: 11 }}>
                  {this.state.info.componentStack}
                </pre>
              )}
            </>
          ) : (
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
              Ocurrió un error inesperado. Por favor reiniciá la app.
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20, padding: '10px 20px',
              background: '#dc2626', color: '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 14, cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
