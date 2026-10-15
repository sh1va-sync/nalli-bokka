import { useEffect } from 'react'
import { AlertCircle, Bell, CheckCircle2, X } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => onDismiss(toast.id), 7000)
    return () => window.clearTimeout(timeout)
  }, [onDismiss, toast])

  if (!toast) return null

  const isError = toast.type === 'error'
  const isNotification = toast.type === 'notification'
  const Icon = isError ? AlertCircle : isNotification ? Bell : CheckCircle2

  return <div
    key={toast.id}
    className={`order-toast pointer-events-auto flex w-full items-start gap-3 rounded-2xl border p-4 shadow-[0_20px_55px_-22px_rgba(43,25,20,.38)] ${isError ? 'border-rose-200 bg-white text-rose-900' : isNotification ? 'border-[var(--border-default)] bg-white text-[var(--text-primary)]' : 'border-[#d5e6d6] bg-white text-[var(--text-secondary)]'}`}
    role={isError ? 'alert' : 'status'}
    aria-live={isError ? 'assertive' : 'polite'}
  >
    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isError ? 'bg-rose-50' : isNotification ? 'bg-[var(--status-danger-soft)] text-[var(--brand-primary)]' : 'bg-[var(--status-success-soft)]'}`}><Icon size={19} /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold">{toast.title}</span>
      <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{toast.message}</span>
      {toast.to && <Link to={toast.to} onClick={() => onDismiss(toast.id)} className="mt-2 inline-flex text-xs font-semibold text-[var(--brand-primary)] hover:underline">{toast.actionLabel || 'View details'} →</Link>}
    </span>
    <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification" className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[#f7f2ee] hover:text-[var(--text-primary)]"><X size={16} /></button>
  </div>
}
