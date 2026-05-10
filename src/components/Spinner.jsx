export default function Spinner({ message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
        <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-2xl">🥗</span>
      </div>
      {message && (
        <p className="text-brand-600 font-medium text-sm text-center max-w-[220px]">{message}</p>
      )}
    </div>
  )
}
