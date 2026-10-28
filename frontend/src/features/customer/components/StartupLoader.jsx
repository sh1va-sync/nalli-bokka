import { LoaderCircle } from 'lucide-react'

export default function StartupLoader() {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--bg-app)] px-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center text-center">
        <LoaderCircle size={36} strokeWidth={1.8} className="text-[var(--brand-primary)] motion-safe:animate-spin" aria-hidden="true" />
        <p className="mt-4 text-xl font-extrabold tracking-tight text-[var(--text-primary)]">NalliBokka</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Loading your store…</p>
      </div>
    </div>
  )
}
