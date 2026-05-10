export default function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
      <span className="text-5xl">{icon}</span>
      <p className="font-semibold text-brand-800 text-lg">{title}</p>
      {subtitle && <p className="text-brand-400 text-sm">{subtitle}</p>}
    </div>
  )
}
