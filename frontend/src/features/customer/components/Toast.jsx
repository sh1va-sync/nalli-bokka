import { useEffect } from 'react'
import { AlertCircle, Bell, CheckCircle2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../../i18n/LanguageContext.js'

export default function Toast({ toast, onDismiss }) {
  const t = useTranslation()
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
    className={`order-toast pointer-events-auto flex w-full items-start gap-3 rounded-2xl border p-4 shadow-[0_20px_55px_-22px_rgba(13,71,161,.28)] ${isError ? 'border-[var(--status-danger)]/20 bg-white text-[var(--status-danger)]' : isNotification ? 'border-[var(--border-default)] bg-white text-[var(--text-primary)]' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'}`}
    role={isError ? 'alert' : 'status'}
    aria-live={isError ? 'assertive' : 'polite'}
  >
    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isError ? 'bg-rose-50' : isNotification ? 'bg-[var(--status-danger-soft)] text-[var(--brand-primary)]' : 'bg-[var(--status-success-soft)]'}`}><Icon size={19} /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold">{t(toast.title)}</span>
      <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{t(toast.message)}</span>
      {toast.to && <Link to={toast.to} onClick={() => onDismiss(toast.id)} className="mt-2 inline-flex text-xs font-semibold text-[var(--brand-primary)] hover:underline">{t(toast.actionLabel || 'View details')} →</Link>}
    </span>
    <button type="button" onClick={() => onDismiss(toast.id)} aria-label={t('Dismiss notification')} className="rounded-lg p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-app)] hover:text-[var(--text-primary)]"><X size={16} /></button>
  </div>
}
