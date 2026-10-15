import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useCancelOrderMutation, useCreatePaymentMutation, useDownloadOrderInvoiceMutation, useGetOrderQuery, useGetOrdersQuery, useVerifyPaymentMutation } from '../../api/api.js'
import CookingLoader from '../components/CookingLoader.jsx'
import { formatItemQuantity, formatPrice, getErrorMessage, loadRazorpaySdk, saveInvoicePdf } from '../utils.js'

const statuses = ['all', 'placed', 'packing', 'out for delivery', 'ready for pickup', 'delivered', 'picked up', 'cancelled']
const statusColors = {
  placed: 'bg-[var(--status-success-soft)] text-[var(--status-success)]',
  packing: 'bg-amber-50 text-amber-800',
  'out for delivery': 'bg-blue-50 text-blue-800',
  'ready for pickup': 'bg-amber-50 text-amber-800',
  delivered: 'bg-emerald-50 text-emerald-800',
  'picked up': 'bg-emerald-50 text-emerald-800',
  cancelled: 'bg-rose-50 text-rose-800',
}

function StatusPill({ status }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>
}

function OrderProgress({ status, orderType = 'delivery' }) {
  if (status === 'cancelled') return <div className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">This order was cancelled.</div>
  const stages = orderType === 'pickup'
    ? ['placed', 'packing', 'ready for pickup', 'picked up']
    : ['placed', 'packing', 'out for delivery', 'delivered']
  const activeIndex = stages.indexOf(status)
  return <div className="mt-5 rounded-2xl border border-[var(--border-default)] bg-white p-4">
    <p className="mb-4 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Order progress <span className="font-normal normal-case tracking-normal">· refreshes automatically</span></p>
    <div className="grid grid-cols-4">
      {stages.map((stage, index) => <div key={stage} className="relative flex flex-col items-center text-center">
        {index < stages.length - 1 && <span className={`absolute left-1/2 top-2.5 h-0.5 w-full ${index < activeIndex ? 'bg-[#79a47a]' : 'bg-[var(--border-default)]'}`} />}
        <span className={`relative z-10 h-5 w-5 rounded-full border-2 ${index <= activeIndex ? 'border-[#39744d] bg-[#39744d]' : 'border-[#dce5d8] bg-white'}`} />
        <span className={`mt-2 px-1 text-[9px] leading-4 sm:text-[11px] ${index <= activeIndex ? 'font-bold text-[var(--text-secondary)]' : 'text-slate-400'}`}>{stage}</span>
      </div>)}
    </div>
  </div>
}

function RefundDetails({ refund, paymentStatus }) {
  const refundStatus = refund?.status || {
    refund_pending: 'pending',
    refunded: 'processed',
    refund_failed: 'failed',
  }[paymentStatus]
  if (!refundStatus) return null

  const statusStyles = {
    pending: 'bg-amber-50 text-amber-800',
    processed: 'bg-emerald-50 text-emerald-800',
    failed: 'bg-rose-50 text-rose-800',
  }
  const statusMessages = {
    pending: 'The store has cancelled your order and requested a full refund. Razorpay is processing it; the status will update here when confirmed.',
    processed: 'Razorpay has marked the refund as processed. Your bank or UPI provider may take around 5–7 business days to credit it.',
    failed: 'The refund attempt could not be completed. Your order remains cancelled; please contact the store for help with the refund.',
  }
  const formatDate = (value) => value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : null

  return <section className="mt-4 rounded-2xl border border-[var(--border-default)] bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Refund details</p><h2 className="mt-1 text-base font-extrabold text-[var(--text-secondary)]">Full order refund</h2></div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyles[refundStatus] || statusStyles.pending}`}>{refundStatus}</span>
    </div>
    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{statusMessages[refundStatus] || statusMessages.pending}</p>
    <dl className="mt-4 grid gap-3 border-t border-[var(--surface-subtle)] pt-4 text-xs sm:grid-cols-2">
      {refund?.amount != null && <div><dt className="text-[var(--text-tertiary)]">Refund amount</dt><dd className="mt-1 font-bold text-[var(--status-success)]">{formatPrice(refund.amount)}</dd></div>}
      {formatDate(refund?.requestedAt) && <div><dt className="text-[var(--text-tertiary)]">Requested</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{formatDate(refund.requestedAt)}</dd></div>}
      {formatDate(refund?.updatedAt) && <div><dt className="text-[var(--text-tertiary)]">Last updated</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{formatDate(refund.updatedAt)}</dd></div>}
      {refund?.reference && <div><dt className="text-[var(--text-tertiary)]">Refund reference</dt><dd className="mt-1 break-all font-mono font-semibold text-[var(--text-primary)]">{refund.reference}</dd></div>}
    </dl>
  </section>
}

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState('all')
  const [orderType, setOrderType] = useState('all')
  const [page, setPage] = useState(1)
  const selectedOrderId = searchParams.get('order')
  const { data: listResponse, isLoading, error, refetch } = useGetOrdersQuery({ page, limit: 20, ...(status !== 'all' ? { orderStatus: status } : {}), ...(orderType !== 'all' ? { orderType } : {}) }, { skip: Boolean(selectedOrderId), pollingInterval: 30000 })
  const { data: detailResponse, isLoading: detailLoading, error: detailError } = useGetOrderQuery(selectedOrderId, { skip: !selectedOrderId, pollingInterval: 30000 })
  const [cancelOrder, cancelState] = useCancelOrderMutation()
  const [createPayment, paymentState] = useCreatePaymentMutation()
  const [verifyPayment] = useVerifyPaymentMutation()
  const [actionMessage, setActionMessage] = useState('')
  const [invoiceError, setInvoiceError] = useState('')
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState('')
  const [downloadOrderInvoice] = useDownloadOrderInvoiceMutation()
  const order = detailResponse?.data
  const orders = listResponse?.data || []
  const storePhone = order?.storeId?.storePhone || order?.storeId?.storeNumber || ''
  const storePhoneLink = storePhone.replace(/[^\d+]/g, '')
  const cancelAllowed = order
    && ['placed', 'packing'].includes(order.orderStatus)
    && ['pending', 'failed'].includes(order.paymentStatus)
  const paymentAllowed = order
    && order.orderStatus !== 'cancelled'
    && ['pending', 'failed'].includes(order.paymentStatus)

  async function downloadInvoice(invoiceOrder) {
    setInvoiceError('')
    setDownloadingInvoiceId(invoiceOrder._id)
    try {
      const blob = await downloadOrderInvoice(invoiceOrder._id).unwrap()
      saveInvoicePdf(blob, invoiceOrder._id)
    } catch (requestError) {
      setInvoiceError(getErrorMessage(requestError))
    } finally {
      setDownloadingInvoiceId('')
    }
  }

  async function cancelCurrent() {
    setActionMessage('')
    try {
      await cancelOrder(order._id).unwrap()
      setActionMessage('Order cancelled.')
    } catch (requestError) {
      setActionMessage(getErrorMessage(requestError))
    }
  }

  async function payForCurrentOrder() {
    setActionMessage('')
    try {
      const response = await createPayment(order._id).unwrap()
      const payment = response.data
      const loaded = await loadRazorpaySdk()
      if (!loaded || !window.Razorpay) throw new Error('Razorpay Checkout could not be loaded. Please check your connection and try again.')
      const checkout = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: 'NalliBokka',
        description: `Order ${order._id}`,
        order_id: payment.razorpayOrderId,
        theme: { color: 'var(--brand-primary)' },
        handler: async (paymentResult) => {
          try {
            await verifyPayment({
              razorpayOrderId: paymentResult.razorpay_order_id,
              paymentId: paymentResult.razorpay_payment_id,
              signature: paymentResult.razorpay_signature,
            }).unwrap()
            setActionMessage('Payment verified. Your order is now paid.')
          } catch (requestError) {
            setActionMessage(`Payment verification failed: ${getErrorMessage(requestError)} Check the order status before retrying.`)
          }
        },
        modal: { ondismiss: () => setActionMessage('Payment was not completed. You can try again when you’re ready.') },
      })
      checkout.open()
    } catch (requestError) {
      setActionMessage(getErrorMessage(requestError))
    }
  }

  if (selectedOrderId) return <>
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
    <button onClick={() => setSearchParams({})} className="text-sm font-semibold text-[var(--brand-primary)] hover:text-[var(--brand-primary)]">← Back to all orders</button>
    {detailLoading ? <p className="mt-8 text-sm text-slate-500">Loading your order…</p> : detailError ? <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{getErrorMessage(detailError)}</p> : order && <>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--text-secondary)]">Order details</p><h1 className="mt-1 text-2xl font-black text-[var(--text-secondary)]">Order #{order._id.slice(-8).toUpperCase()}</h1><p className="mt-1 text-xs text-slate-500">{new Date(order.createdAt).toLocaleString('en-IN')}</p></div><StatusPill status={order.orderStatus} /></div>
      <OrderProgress status={order.orderStatus} orderType={order.orderType} />
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-[var(--border-default)] bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Payment</p><p className="mt-2 text-sm font-bold capitalize text-[var(--status-success)]">{order.paymentStatus.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-500">{['refund_pending', 'refunded', 'refund_failed'].includes(order.paymentStatus) ? 'See the refund details below for its status and reference.' : 'Order status is updated by your store.'}</p></div><div className="rounded-2xl border border-[var(--border-default)] bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{order.orderType === 'pickup' ? 'Store pickup' : 'Delivery address'}</p>{order.orderType === 'pickup' ? <><p className="mt-2 text-sm font-bold text-[var(--status-success)]">{order.storeId?.storeName || 'Selected store'}</p><p className="mt-1 text-xs leading-5 text-slate-500">{new Date(order.pickupAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })} IST</p><p className="mt-1 text-xs leading-5 text-slate-500">{order.storeId?.location}</p></> : <><p className="mt-2 text-sm font-bold text-[var(--status-success)]">{order.deliveryAddress?.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{order.deliveryAddress?.fullAddress} · {order.deliveryAddress?.pincode}</p></>}</div></div>
      <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-default)] bg-white p-4">
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Need help with this order?</p><p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{order.storeId?.storeName || 'Your store'}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Share order #{order._id.slice(-8).toUpperCase()} when you call.</p></div>
        {storePhoneLink
          ? <a href={`tel:${storePhoneLink}`} className="inline-flex h-10 items-center rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-bold text-white transition hover:bg-[var(--brand-primary-hover)]">Call store · {storePhone}</a>
          : <p className="text-xs text-[var(--text-secondary)]">This store hasn’t added a contact number yet.</p>}
      </section>
      <RefundDetails refund={order.refund} paymentStatus={order.paymentStatus} />
      <section className="mt-4 rounded-2xl border border-[var(--border-default)] bg-white p-5"><h2 className="font-extrabold text-[var(--text-secondary)]">What’s in the bag</h2><div className="mt-4 divide-y divide-[var(--surface-subtle)]">{order.items?.map((item, index) => <div key={`${item.productId}-${index}`} className="flex justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-semibold text-[var(--status-success)]">{item.productName}</p><p className="mt-1 text-xs text-slate-500">{formatItemQuantity(item)}</p></div><span className="text-sm font-bold text-[var(--text-secondary)]">{formatPrice(item.price)}</span></div>)}</div><div className="mt-4 flex justify-between border-t border-[var(--surface-subtle)] pt-4 text-sm"><span className="font-semibold text-slate-500">Total</span><span className="font-extrabold text-[var(--text-secondary)]">{formatPrice(order.totalAmount)}</span></div></section>
      {actionMessage && <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${actionMessage.toLowerCase().includes('failed') ? 'bg-rose-50 text-rose-800' : 'bg-[var(--status-success-soft)] text-[var(--text-secondary)]'}`}>{actionMessage}</p>}
      {paymentAllowed && <button disabled={paymentState.isLoading} onClick={payForCurrentOrder} className="mt-4 rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-bold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50">{paymentState.isLoading ? 'Connecting to Razorpay…' : 'Pay for this order'}</button>}
      {cancelAllowed && <button disabled={cancelState.isLoading} onClick={cancelCurrent} className="mt-4 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{cancelState.isLoading ? 'Cancelling…' : 'Cancel order'}</button>}
    </>}
    </div>
  </>

  return <>
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--text-secondary)]">A little something for later</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--text-secondary)]">My orders</h1><p className="mt-1 text-sm text-slate-500">Your fresh finds, past and present.</p></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">{statuses.map((item) => <button key={item} onClick={() => { setStatus(item); setPage(1) }} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold capitalize ${status === item ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white' : 'border-[var(--border-default)] bg-white text-[var(--text-secondary)]'}`}>{item === 'all' ? 'All statuses' : item}</button>)}</div>
      <label className="flex h-10 items-center rounded-xl border border-[var(--border-default)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)]"><span className="mr-2">Order type</span><select aria-label="Filter orders by type" value={orderType} onChange={(event) => { setOrderType(event.target.value); setPage(1) }} className="bg-transparent text-[var(--text-primary)] outline-none"><option value="all">All</option><option value="delivery">Delivery</option><option value="pickup">Store pickup</option></select></label>
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{getErrorMessage(error)} <button onClick={refetch} className="font-bold underline">Retry</button></p>}
    {invoiceError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{invoiceError}</p>}
    {isLoading ? <div className="mt-5"><CookingLoader label="Gathering your orders…" /></div> : orders.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{orders.map((item) => <article key={item._id} className="rounded-[20px] border border-[var(--border-default)] bg-white p-4 transition hover:border-[#bfd2b9] hover:shadow-sm">
      <button type="button" onClick={() => setSearchParams({ order: item._id })} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-[var(--text-secondary)]">Order #{item._id.slice(-8).toUpperCase()}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p><span className="mt-2 inline-flex rounded-full bg-[var(--brand-primary-soft)] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[var(--brand-primary)]">{item.orderType === 'pickup' ? 'Store pickup' : 'Delivery'}</span></div><StatusPill status={item.orderStatus} /></div>
        <p className="mt-3 line-clamp-1 text-sm font-semibold text-[var(--status-success)]">{item.items?.map(({ productName }) => productName).join(' · ')}</p>
        <div className="mt-3 flex justify-between border-t border-[var(--surface-subtle)] pt-3 text-xs"><span className="capitalize text-slate-500">Payment {item.paymentStatus}</span><span className="font-extrabold text-[var(--text-secondary)]">{formatPrice(item.totalAmount)}</span></div>
      </button>
      <div className="mt-3 flex justify-end"><button type="button" onClick={() => downloadInvoice(item)} disabled={Boolean(downloadingInvoiceId)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dfe7dc] px-3 text-xs font-bold text-[var(--status-success)] hover:bg-[var(--bg-app)] disabled:cursor-wait disabled:opacity-50"><FileText size={14} />{downloadingInvoiceId === item._id ? 'Preparing PDF…' : 'Download invoice'}</button></div>
    </article>)}</div> : <div className="mt-5 rounded-[22px] border border-[var(--border-default)] bg-white px-5 py-14 text-center"><span className="text-4xl">🧺</span><h2 className="mt-3 font-bold text-[var(--text-secondary)]">No orders to show</h2><p className="mt-1 text-sm text-slate-500">When you place an order, it’ll find its way here.</p></div>}
    {listResponse?.pagination?.pages > 1 && <div className="mt-6 flex items-center justify-center gap-3"><button disabled={page <= 1 || isLoading} onClick={() => setPage((current) => current - 1)} className="rounded-xl border border-[#cdddc8] bg-white px-4 py-2.5 text-sm font-bold text-[var(--status-success)] disabled:opacity-40">Previous</button><span className="text-xs text-[var(--text-secondary)]">Page {page} of {listResponse.pagination.pages}</span><button disabled={page >= listResponse.pagination.pages || isLoading} onClick={() => setPage((current) => current + 1)} className="rounded-xl border border-[#cdddc8] bg-white px-4 py-2.5 text-sm font-bold text-[var(--status-success)] disabled:opacity-40">Next</button></div>}
    </div>
  </>
}
