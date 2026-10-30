import { useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { AlertCircle, ArrowLeft, ChevronRight, CreditCard, FileText, MapPin, Package, RefreshCw, Save, UserRound } from 'lucide-react'
import { useAddStoreTransactionNoteMutation, useGetStoreTransactionQuery } from '../../api/api.js'
import { formatItemQuantity, formatPrice, getErrorMessage } from '../../customer/utils.js'
import { useTranslation } from '../../i18n/LanguageContext.js'
import LanguageSwitcher from '../../i18n/LanguageSwitcher.jsx'
import StoreLoader from '../components/StoreLoader.jsx'

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function DetailField({ label, value, mono = false }) {
  const t = useTranslation()
  return <div className="min-w-0 rounded-xl bg-[var(--bg-app)] p-3">
    <p className="text-[10px] font-medium text-[var(--text-secondary)]">{t(label)}</p>
    <p className={`mt-1 break-all text-xs font-semibold text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
  </div>
}

function DetailSection({ title, icon: Icon, children }) {
  const t = useTranslation()
  return <section className="rounded-[18px] border border-[var(--border-default)] bg-white p-4 sm:p-5">
    <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]"><Icon size={16} className="text-[var(--brand-primary)]" />{t(title)}</h2>
    <div className="mt-4">{children}</div>
  </section>
}

export default function StoreTransactionDetailPage() {
  const t = useTranslation()
  const { transactionId } = useParams()
  const [searchParams] = useSearchParams()
  const [noteDraft, setNoteDraft] = useState('')
  const [noteError, setNoteError] = useState('')
  const [addNote, addNoteState] = useAddStoreTransactionNoteMutation()
  const returnTo = searchParams.get('returnTo') || '/store'
  const token = useSelector((state) => state.storeAuth.token)
  const { currentData: response, error, isLoading, isFetching, refetch } = useGetStoreTransactionQuery(transactionId, { skip: !token })
  const transaction = response?.data
  const order = transaction?.order
  const customer = order?.userId

  async function saveCaseNote(event) {
    event.preventDefault()
    setNoteError('')
    try {
      await addNote({ transactionId, note: noteDraft }).unwrap()
      setNoteDraft('')
    } catch (requestError) {
      setNoteError(getErrorMessage(requestError))
    }
  }

  if (!token || error?.status === 401 || error?.status === 403) {
    return <Navigate to="/store/login" replace />
  }

  return <div className="min-h-screen bg-[#f1f1ed] text-[var(--text-primary)]">
    <header className="sticky top-0 z-20 border-b border-[#e5e4de] bg-[#f1f1ed]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/store" className="flex items-center gap-3">
          <img src="/nallibokka-logo.png" alt="" className="h-9 w-9 object-contain" />
          <span><span className="block text-sm font-semibold">NalliBokka</span><span className="block text-[10px] text-[var(--text-tertiary)]">{t('Transaction investigation')}</span></span>
        </Link>
        <LanguageSwitcher compact />
      </div>
    </header>
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-5 sm:px-6 sm:py-7">
      <Link to={returnTo} className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--brand-primary)]"><ArrowLeft size={15} />{t('Back to transactions')}</Link>
      {isLoading ? <StoreLoader label={t('Loading transaction details…')} compact /> : error ? <div role="alert" className="rounded-xl bg-[var(--status-danger-soft)] p-4 text-sm text-[var(--status-danger)]"><div className="flex items-center gap-2"><AlertCircle size={16} />{getErrorMessage(error)}</div><button type="button" onClick={() => refetch()} className="mt-3 inline-flex items-center gap-2 font-semibold"><RefreshCw size={14} />{t('Retry')}</button></div> : transaction && <>
        <section className="rounded-[20px] border border-[var(--border-default)] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--brand-primary)]">{t('Transaction investigation')}</p>
              <h1 className="mt-1 break-all text-xl font-semibold sm:text-2xl">{t('Payment')} · {formatPrice(transaction.amount)}</h1>
              <p className="mt-2 break-all font-mono text-[11px] text-[var(--text-secondary)]">{transaction._id}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatDateTime(transaction.timestamp)}</p>
            </div>
            {isFetching && <span role="status" className="inline-flex items-center gap-2 text-[10px] text-[var(--text-secondary)]"><RefreshCw size={13} className="animate-spin" />{t('Refreshing')}</span>}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <DetailField label="Payment status" value={t(transaction.status)} />
            <DetailField label="Refund status" value={t(transaction.refundStatus || 'none')} />
            <DetailField label="Order status" value={t(order?.orderStatus || '—')} />
            <DetailField label="Order payment status" value={t(order?.paymentStatus || '—')} />
          </div>
        </section>

        <DetailSection title="Payment references" icon={CreditCard}>
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Transaction record ID" value={transaction._id} mono />
            <DetailField label="Razorpay order ID" value={transaction.razorpayOrderId} mono />
            <DetailField label="Payment ID" value={transaction.paymentId} mono />
            <DetailField label="Refund ID" value={transaction.refundId} mono />
            <DetailField label="Refund request ID" value={transaction.refundRequestId} mono />
            <DetailField label="Refund requested at" value={formatDateTime(transaction.refundRequestedAt)} />
          </div>
          {transaction.status === 'failed' && <p className="mt-3 rounded-xl border border-[#ead8cf] bg-[#fff9f6] p-3 text-xs leading-5 text-[var(--text-secondary)]">{t('Gateway decline details are not retained by the app. Use the payment reference above to inspect the attempt in Razorpay.')}</p>}
        </DetailSection>

        <DetailSection title="Customer and fulfillment" icon={UserRound}>
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Customer name" value={customer?.name} />
            <DetailField label="Phone" value={customer?.phone} />
            <DetailField label="Email" value={customer?.email} />
            <DetailField label="Fulfillment" value={t(order?.orderType === 'pickup' ? 'Store pickup' : 'Delivery')} />
          </div>
          {order?.orderType === 'pickup' ? <p className="mt-3 rounded-xl bg-[var(--bg-app)] p-3 text-xs text-[var(--text-secondary)]">{t('Pickup scheduled')}: <strong className="text-[var(--text-primary)]">{formatDateTime(order.pickupAt)}</strong></p> : order?.deliveryAddress && <div className="mt-3 flex gap-2 rounded-xl bg-[var(--bg-app)] p-3 text-xs leading-5 text-[var(--text-secondary)]"><MapPin size={15} className="mt-0.5 shrink-0 text-[var(--brand-primary)]" /><span>{order.deliveryAddress.fullAddress}{order.deliveryAddress.landmark ? ` · ${order.deliveryAddress.landmark}` : ''} · {order.deliveryAddress.pincode}</span></div>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <DetailField label="Order ID" value={order?._id} mono />
            <DetailField label="Order created" value={formatDateTime(order?.createdAt)} />
            <DetailField label="Order last updated" value={formatDateTime(order?.updatedAt)} />
            <DetailField label="Order total" value={order ? formatPrice(order.totalAmount) : '—'} />
          </div>
        </DetailSection>

        <DetailSection title="Items in the order" icon={Package}>
          {order?.items?.length ? <div className="divide-y divide-[var(--surface-subtle)]">
            {order.items.map((item, index) => <div key={`${item.productId}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div><p className="text-xs font-semibold">{t(item.productName)}</p><p className="mt-1 text-[10px] text-[var(--text-secondary)]">{t(formatItemQuantity(item))}</p></div>
              <p className="text-xs font-semibold">{formatPrice(item.price)}</p>
            </div>)}
            <div className="flex justify-between pt-3 text-xs font-bold"><span>{t('Order total')}</span><span>{formatPrice(order.totalAmount)}</span></div>
          </div> : <p className="text-xs text-[var(--text-secondary)]">{t('No order items are available.')}</p>}
        </DetailSection>

        <DetailSection title="Related payment attempts" icon={CreditCard}>
          {transaction.relatedTransactions?.length ? <div className="space-y-2">
            {transaction.relatedTransactions.map((attempt) => <article key={attempt._id} className={`rounded-xl border p-3 ${attempt._id === transaction._id ? 'border-[var(--brand-primary)] bg-[#fff9f6]' : 'border-[var(--border-default)] bg-[var(--bg-app)]'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-xs font-semibold">{t(attempt.status)} · {formatPrice(attempt.amount)}{attempt._id === transaction._id ? ` · ${t('Current transaction')}` : ''}</p><p className="mt-1 text-[10px] text-[var(--text-secondary)]">{formatDateTime(attempt.timestamp)}</p></div>
                <Link to={`/store/transactions/${attempt._id}?returnTo=${encodeURIComponent(returnTo)}`} aria-label={t('View related transaction details')} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--brand-primary)]">{t('Details')} <ChevronRight size={12} /></Link>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <DetailField label="Payment ID" value={attempt.paymentId} mono />
                <DetailField label="Refund" value={attempt.refundStatus && attempt.refundStatus !== 'none' ? `${t(attempt.refundStatus)}${attempt.refundId ? ` · ${attempt.refundId}` : ''}` : t('none')} />
              </div>
            </article>)}
          </div> : <p className="text-xs text-[var(--text-secondary)]">{t('No related payment attempts were found.')}</p>}
        </DetailSection>

        <DetailSection title="Dispute case notes" icon={FileText}>
          <p className="text-xs leading-5 text-[var(--text-secondary)]">{t('Keep internal investigation notes here, such as customer contact, evidence collected, and follow-up actions. Notes are visible to store staff only.')}</p>
          <form onSubmit={saveCaseNote} className="mt-3">
            <label htmlFor="transaction-case-note" className="sr-only">{t('Add an internal note')}</label>
            <textarea id="transaction-case-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} maxLength={2000} required rows={3} placeholder={t('Record dispute findings or next steps…')} className="w-full resize-y rounded-xl border border-[var(--border-default)] bg-white p-3 text-xs leading-5 text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
            {noteError && <p role="alert" className="mt-2 text-xs text-[var(--status-danger)]">{noteError}</p>}
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[10px] text-[var(--text-secondary)]">{noteDraft.length}/2000</span>
              <button type="submit" disabled={!noteDraft.trim() || addNoteState.isLoading} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-3 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-50"><Save size={14} />{t(addNoteState.isLoading ? 'Saving note…' : 'Save internal note')}</button>
            </div>
          </form>
          <div className="mt-4 space-y-2">
            {transaction.caseNotes?.length ? [...transaction.caseNotes].reverse().map((note) => <article key={note._id} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-3">
              <p className="whitespace-pre-wrap text-xs leading-5 text-[var(--text-primary)]">{note.note}</p>
              <time className="mt-2 block text-[10px] text-[var(--text-secondary)]">{formatDateTime(note.createdAt)}</time>
            </article>) : <p className="text-xs text-[var(--text-secondary)]">{t('No internal notes yet.')}</p>}
          </div>
        </DetailSection>

        {transaction.checkoutAttempt && <DetailSection title="Checkout attempt" icon={CreditCard}>
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Checkout attempt ID" value={transaction.checkoutAttempt._id} mono />
            <DetailField label="Checkout status" value={t(transaction.checkoutAttempt.status)} />
            <DetailField label="Checkout amount" value={formatPrice(transaction.checkoutAttempt.amount)} />
            <DetailField label="Attempt started" value={formatDateTime(transaction.checkoutAttempt.createdAt)} />
            <DetailField label="Attempt last updated" value={formatDateTime(transaction.checkoutAttempt.updatedAt)} />
          </div>
        </DetailSection>}
      </>}
    </main>
  </div>
}
