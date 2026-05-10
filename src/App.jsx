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
      {/* Full-screen container that extends under status bar (black-translucent) */}
      <div className="min-h-screen bg-brand-50 flex flex-col">
        {/* Status bar spacer for iPhone notch / Dynamic Island */}
        <div className="w-full bg-brand-50 safe-top" />

        <main className="flex-1 px-4 pb-safe-nav pt-2 max-w-lg mx-auto w-full safe-x overflow-y-auto">
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
