import { useState, useCallback } from 'react'
import { ToastProvider } from './context/AppContext'
import BottomNav from './components/BottomNav'
import Scanner from './pages/Scanner'
import Inventory from './pages/Inventory'
import Recipes from './pages/Recipes'

export default function App() {
  const [activeTab, setActiveTab] = useState('inventory')
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0)

  const refreshInventory = useCallback(() => {
    setInventoryRefreshKey((k) => k + 1)
  }, [])

  return (
    <ToastProvider>
      {/*
        Layout strategy for iOS / Capacitor:
        - Outer div: min-h-screen keeps it tall even if children are empty
        - safe-top div: explicit spacer for notch / Dynamic Island
        - main: NO overflow-y-auto here (causes flex-child collapse on older iOS);
          scrolling is handled by the body. pb-safe-nav avoids the fixed nav bar.
        - BottomNav: fixed, bottom-0, with its own safe-bottom spacer inside
      */}
      <div className="flex flex-col bg-brand-50" style={{ minHeight: '100vh', minHeight: '-webkit-fill-available' }}>

        {/* Notch / Dynamic Island spacer */}
        <div className="w-full bg-brand-50" style={{ height: 'env(safe-area-inset-top)' }} />

        <main
          className="flex-1 px-4 max-w-lg mx-auto w-full"
          style={{
            paddingTop: '0.5rem',
            paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))',
            paddingLeft: 'max(1rem, env(safe-area-inset-left))',
            paddingRight: 'max(1rem, env(safe-area-inset-right))',
          }}
        >
          {activeTab === 'scanner' && (
            <Scanner onInventoryUpdate={refreshInventory} />
          )}
          {activeTab === 'inventory' && (
            <Inventory refreshKey={inventoryRefreshKey} />
          )}
          {activeTab === 'recipes' && (
            <Recipes onInventoryUpdate={refreshInventory} />
          )}
        </main>

        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </ToastProvider>
  )
}
