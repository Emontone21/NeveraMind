const TABS = [
  { id: 'scanner', label: 'Escanear', icon: '📷' },
  { id: 'inventory', label: 'Mi inventario', icon: '🥦' },
  { id: 'recipes', label: '¿Qué cocino?', icon: '🍳' },
]

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-brand-100 shadow-lg z-40 safe-x">
      {/* Tab buttons */}
      <div className="flex justify-around items-center px-1 pt-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`tab-item flex-1 ${activeTab === tab.id ? 'active' : ''}`}
          >
            <span className="text-2xl leading-none">{tab.icon}</span>
            <span className="leading-tight">{tab.label}</span>
          </button>
        ))}
      </div>
      {/* iPhone home indicator safe area */}
      <div className="safe-bottom bg-white" />
    </nav>
  )
}
