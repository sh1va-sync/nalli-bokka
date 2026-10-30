import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, Headset, House, MapPin } from 'lucide-react'
import { useCancelOrderMutation, useCreatePaymentMutation, useDownloadOrderInvoiceMutation, useGetOrderQuery, useGetOrdersQuery, useVerifyPaymentMutation } from '../../api/api.js'
import CookingLoader from '../components/CookingLoader.jsx'
import { getCategoryPhoto } from '../components/categoryAssets.js'
import { formatItemQuantity, formatPrice, getErrorMessage, loadRazorpaySdk, saveInvoicePdf } from '../utils.js'
import { useLanguage, useTranslation } from '../../i18n/LanguageContext.js'

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
  const t = useTranslation()
  const isComplete = ['delivered', 'picked up'].includes(status)
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold capitalize ${statusColors[status] || 'bg-slate-100 text-slate-600'}`}>{isComplete && <Check size={13} strokeWidth={2.5} />}{t(status)}</span>
}

function OrderProgress({ status, orderType = 'delivery' }) {
  const t = useTranslation()
  if (status === 'cancelled') return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-800">{t('This order was cancelled.')}</div>
  const stages = orderType === 'pickup'
    ? ['placed', 'packing', 'ready for pickup', 'picked up']
    : ['placed', 'packing', 'out for delivery', 'delivered']
  const activeIndex = Math.max(0, stages.indexOf(status))
  return <div className="rounded-[22px] border border-[var(--border-default)] bg-white px-4 py-5 sm:px-7 sm:py-6">
    <h2 className="mb-5 text-lg font-extrabold tracking-tight text-[var(--text-primary)] sm:text-2xl">{t('Order progress')}</h2>
    <div className="grid grid-cols-4">
      {stages.map((stage, index) => <div key={stage} className="relative flex flex-col items-center text-center">
        {index < stages.length - 1 && <span className={`absolute left-1/2 top-[18px] h-[3px] w-full ${index < activeIndex ? 'bg-[#8bc5a2]' : 'bg-[var(--border-default)]'}`} />}
        <span className={`relative z-10 grid h-9 w-9 place-items-center rounded-full border-2 sm:h-11 sm:w-11 ${index <= activeIndex ? 'border-[#176149] bg-[#176149] text-white' : 'border-[#c9dfce] bg-white text-transparent'}`}>{index <= activeIndex && <Check size={19} strokeWidth={2.5} />}</span>
        <span className={`mt-2 px-0.5 text-[9px] leading-4 sm:text-sm ${index <= activeIndex ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{t(stage)}</span>
      </div>)}
    </div>
  </div>
}

function RefundDetails({ refund, paymentStatus }) {
  const t = useTranslation()
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
      <div><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{t('Refund details')}</p><h2 className="mt-1 text-base font-extrabold text-[var(--text-secondary)]">{t('Full order refund')}</h2></div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusStyles[refundStatus] || statusStyles.pending}`}>{t(refundStatus)}</span>
    </div>
    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{t(statusMessages[refundStatus] || statusMessages.pending)}</p>
    <dl className="mt-4 grid gap-3 border-t border-[var(--surface-subtle)] pt-4 text-xs sm:grid-cols-2">
      {refund?.amount != null && <div><dt className="text-[var(--text-tertiary)]">{t('Refund amount')}</dt><dd className="mt-1 font-bold text-[var(--status-success)]">{formatPrice(refund.amount)}</dd></div>}
      {formatDate(refund?.requestedAt) && <div><dt className="text-[var(--text-tertiary)]">{t('Requested')}</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{formatDate(refund.requestedAt)}</dd></div>}
      {formatDate(refund?.updatedAt) && <div><dt className="text-[var(--text-tertiary)]">{t('Last updated')}</dt><dd className="mt-1 font-semibold text-[var(--text-primary)]">{formatDate(refund.updatedAt)}</dd></div>}
      {refund?.reference && <div><dt className="text-[var(--text-tertiary)]">{t('Refund reference')}</dt><dd className="mt-1 break-all font-mono font-semibold text-[var(--text-primary)]">{refund.reference}</dd></div>}
    </dl>
  </section>
}

export default function OrdersPage() {
  const t = useTranslation()
  const { language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const selectedOrderId = searchParams.get('order')
  const { data: listResponse, isLoading, error, refetch } = useGetOrdersQuery({ page, limit: 20 }, { skip: Boolean(selectedOrderId), pollingInterval: 30000 })
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
  const orderIdLabel = order?._id.slice(-8).toUpperCase()
  const orderDate = order
    ? new Date(order.createdAt).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).replace(',', ' · ').replace(/\b(am|pm)\b/i, value => value.toUpperCase())
    : ''
  const orderHeadline = {
    placed: 'Your order is placed',
    packing: 'Your order is being packed',
    'out for delivery': 'Your order is on its way',
    'ready for pickup': 'Your order is ready for pickup',
    delivered: 'Your order is delivered',
    'picked up': 'Your order is picked up',
    cancelled: 'Your order was cancelled',
  }[order?.orderStatus] || 'Track your order'
  const orderDescription = {
    placed: 'We’ll update you as your store prepares it.',
    packing: 'Your store is preparing your items.',
    'out for delivery': 'Your order is on its way to you.',
    'ready for pickup': 'Your order is ready at the store.',
    delivered: 'Your order has been delivered. Enjoy!',
    'picked up': 'Your order has been picked up. Enjoy!',
    cancelled: 'If you have questions about this order, contact your store.',
  }[order?.orderStatus] || 'Your store will keep this order status up to date.'

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
      setActionMessage(t('Order cancelled.'))
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
            setActionMessage(t('Payment verified. Your order is now paid.'))
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
    <div className="mx-auto max-w-6xl px-3.5 py-4 sm:px-6 sm:py-8 lg:px-8">
      <button type="button" onClick={() => setSearchParams({})} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[var(--brand-primary)] shadow-sm transition hover:bg-[var(--brand-primary-soft)]"><ArrowLeft size={17} />{t('All orders')}</button>
      {detailLoading ? <p className="mt-8 text-sm text-slate-500">{t('Loading your order…')}</p> : detailError ? <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{t(getErrorMessage(detailError))}</p> : order && <>
        <section className="relative isolate mt-4 min-h-[205px] overflow-hidden rounded-[26px] border border-[#e2eee4] bg-gradient-to-r from-[#edf6ee] via-[#e9f4eb] to-[#e0efe2] px-5 py-5 sm:min-h-[260px] sm:rounded-[30px] sm:px-8 sm:py-7">
          <img src="/hero/green-market.svg" alt="" className="pointer-events-none absolute -right-12 bottom-0 z-0 h-[92%] w-[60%] object-contain object-right-bottom opacity-70 sm:right-0 sm:h-full sm:w-[47%]" />
          <div className="relative z-10 max-w-[66%] sm:max-w-[62%]">
            <p className="inline-flex rounded-full border border-[#c7e0cc] bg-white/55 px-3 py-1 text-xs font-extrabold text-[var(--text-primary)] sm:text-base">Order #{orderIdLabel}</p>
            <h1 className="mt-3 text-[26px] font-black leading-[1.08] tracking-tight text-[#103c30] sm:mt-4 sm:text-4xl">{orderHeadline}</h1>
            <p className="mt-2 max-w-md text-sm leading-5 text-[var(--text-secondary)] sm:mt-3 sm:text-lg sm:leading-7">{orderDescription}</p>
            <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] sm:mt-6 sm:text-base"><CalendarDays size={17} className="shrink-0 text-[var(--brand-primary)]" />{orderDate}</p>
          </div>
          <div className="absolute right-3 top-3 z-10"><StatusPill status={order.orderStatus} /></div>
        </section>

        <section className="mt-4 sm:mt-5">
          <OrderProgress status={order.orderStatus} orderType={order.orderType} />
          {order.orderStatus !== 'cancelled' && <p className="mt-2 px-1 text-xs text-[var(--text-secondary)]">{t('Status refreshes automatically.')}</p>}
        </section>

        <section className="mt-5">
          <div className="mb-3 flex items-end justify-between px-1">
            <h2 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-2xl">{t('Order summary')}</h2>
            <span className="text-sm text-[var(--text-secondary)]">{order.items?.length || 0} {t(order.items?.length === 1 ? 'item' : 'items')}</span>
          </div>
          <div className="rounded-[22px] border border-[var(--border-default)] bg-white p-4 shadow-[0_8px_24px_-22px_rgba(27,61,44,0.3)] sm:p-6">
            <div className="divide-y divide-[var(--border-default)]">
              {order.items?.map((item, index) => {
                const product = typeof item.productId === 'object' ? item.productId : null
                const imageUrl = item.imageUrl || product?.imageUrl || getCategoryPhoto(item.productType || product?.productType || item.productName)
                return <div key={`${item.productId}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-3 sm:gap-5 sm:py-4">
                  <img
                    src={imageUrl}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.onerror = null
                      event.currentTarget.src = getCategoryPhoto(item.productType || product?.productType || item.productName)
                    }}
                    className="h-[58px] w-[58px] shrink-0 rounded-xl object-cover sm:h-[76px] sm:w-[76px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text-primary)] sm:text-lg">{t(item.productName)}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-base">{t(formatItemQuantity(item))}</p>
                  </div>
                  <span className="shrink-0 text-sm font-extrabold text-[var(--text-primary)] sm:min-w-20 sm:text-right sm:text-lg">{formatPrice(item.price)}</span>
                </div>
              })}
            </div>
            <div className="space-y-2 border-t border-[var(--border-default)] pt-3 text-sm sm:pt-4 sm:text-base">
              <div className="flex justify-between gap-4 text-[var(--text-secondary)]"><span>{t('Items total')}</span><span className="font-semibold text-[var(--text-primary)]">{formatPrice(order.totalAmount)}</span></div>
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-[var(--brand-primary-soft)] px-3.5 py-3 sm:px-4">
                <div><p className="font-extrabold text-[var(--text-primary)]">{t(order.paymentStatus === 'paid' ? 'Total paid' : ['refund_pending', 'refunded', 'refund_failed'].includes(order.paymentStatus) ? 'Refund status' : 'Order total')}</p><p className="mt-0.5 text-xs capitalize text-[var(--text-secondary)]">{t(order.paymentStatus.replaceAll('_', ' '))}</p></div>
                <span className="text-xl font-black text-[#103c30] sm:text-2xl">{formatPrice(order.totalAmount)}</span>
              </div>
            </div>
            {order.paymentStatus === 'paid' && <button type="button" onClick={() => downloadInvoice(order)} disabled={Boolean(downloadingInvoiceId)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)] disabled:cursor-wait disabled:opacity-50"><ArrowDownToLine size={16} />{t(downloadingInvoiceId === order._id ? 'Preparing invoice…' : 'Download invoice')}</button>}
          </div>
        </section>

        {order.orderType === 'pickup' ? <section className="mt-4 rounded-[22px] border border-[var(--border-default)] bg-white p-4 sm:mt-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-[var(--text-primary)] sm:text-xl">{t('Pickup details')}</h2>
          <div className="mt-3 flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><MapPin size={26} /></span>
            <div className="min-w-0"><p className="font-bold text-[var(--text-primary)]">{order.storeId?.storeName || 'Selected store'}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{new Date(order.pickupAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST</p>{order.storeId?.location && <p className="mt-1 text-sm text-[var(--text-secondary)]">{order.storeId.location}</p>}</div>
          </div>
        </section> : <section className="mt-4 rounded-[22px] border border-[var(--border-default)] bg-white p-4 sm:mt-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-[var(--text-primary)] sm:text-xl">{t('Delivery address')}</h2>
          <div className="mt-3 flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><House size={26} /></span>
            <div className="min-w-0"><p className="font-bold text-[var(--text-primary)]">{t(order.deliveryAddress?.label)}</p><p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{order.deliveryAddress?.fullAddress} · {order.deliveryAddress?.pincode}</p></div>
          </div>
        </section>}

        {storePhoneLink ? <a href={`tel:${storePhoneLink}`} className="mt-4 flex items-center gap-4 rounded-[22px] border border-[var(--border-default)] bg-white p-4 transition hover:border-[var(--brand-secondary)] sm:mt-5 sm:p-6">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><Headset size={26} /></span>
          <span className="min-w-0 flex-1"><span className="block font-extrabold text-[var(--text-primary)]">{t('Need help with this order?')}</span><span className="mt-1 block text-sm text-[var(--text-secondary)]">{t('Share order')} #{orderIdLabel} {t('with')} {order.storeId?.storeName || t('your store')}.</span></span>
          <ChevronRight size={22} className="shrink-0 text-[var(--text-secondary)]" />
        </a> : <section className="mt-4 flex items-center gap-4 rounded-[22px] border border-[var(--border-default)] bg-white p-4 sm:mt-5 sm:p-6">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><Headset size={26} /></span>
          <div className="min-w-0"><h2 className="font-extrabold text-[var(--text-primary)]">{t('Need help with this order?')}</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{t('This store hasn’t added a contact number yet.')} {t('Share order')} #{orderIdLabel} {t('when you contact the store')}.</p></div>
        </section>}

        <RefundDetails refund={order.refund} paymentStatus={order.paymentStatus} />
        {invoiceError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{invoiceError}</p>}
        {actionMessage && <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${actionMessage.toLowerCase().includes('failed') ? 'bg-rose-50 text-rose-800' : 'bg-[var(--status-success-soft)] text-[var(--text-secondary)]'}`}>{actionMessage}</p>}
        {(paymentAllowed || cancelAllowed) && <div className="mt-4 flex flex-wrap gap-3">
          {paymentAllowed && <button disabled={paymentState.isLoading} onClick={payForCurrentOrder} className="rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-bold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50">{t(paymentState.isLoading ? 'Connecting to Razorpay…' : 'Pay for this order')}</button>}
          {cancelAllowed && <button disabled={cancelState.isLoading} onClick={cancelCurrent} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{t(cancelState.isLoading ? 'Cancelling…' : 'Cancel order')}</button>}
        </div>}
      </>}
    </div>
  </>

  return <>
    <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-9 lg:px-8">
    <section className="relative isolate overflow-hidden rounded-[24px] border border-[#e6e9df] bg-gradient-to-r from-[#f7f8f2] via-[#f2f6ee] to-[#e6f0e5] px-5 py-6 sm:rounded-[30px] sm:px-9 sm:py-8">
      <img src="/categories/meat.png" alt="" className="pointer-events-none absolute right-0 top-0 z-0 h-full w-[45%] object-cover opacity-25 [mask-image:linear-gradient(to_right,transparent_0%,black_55%)] sm:w-[38%]" />
      <div className="relative z-10">
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--brand-primary)]">{t('Made fresh, delivered with care')}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--text-primary)] sm:text-4xl">{t('Your orders')}</h1>
        <p className="mt-2 max-w-md text-sm leading-5 text-[var(--text-secondary)] sm:text-base">{t('Track deliveries and revisit your purchases.')}</p>
      </div>
    </section>
    {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{getErrorMessage(error)} <button onClick={refetch} className="font-bold underline">Retry</button></p>}
    {invoiceError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{invoiceError}</p>}
    {isLoading ? <div className="mt-5"><CookingLoader label={t('Gathering your orders…')} /></div> : orders.length ? <div className="mt-5 grid gap-3 sm:gap-4">{orders.map((item) => {
      const orderItems = item.items || []
      const itemNames = orderItems.map(({ productName }) => t(productName)).join(' · ')
      const itemQuantity = orderItems.reduce((sum, orderItem) => sum + Number(orderItem.quantity || 0), 0)
      const quantityLabel = orderItems.length > 0 && orderItems.every(({ selectionType }) => selectionType === 'weight')
        ? `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(itemQuantity)} kg`
        : `${orderItems.length} ${t(orderItems.length === 1 ? 'item' : 'items')}`
      const paymentLabel = item.paymentStatus === 'paid' ? t('Paid') : t(item.paymentStatus.replaceAll('_', ' '))
      return <article key={item._id} className="rounded-[22px] border border-[var(--border-default)] bg-white p-4 shadow-[0_8px_24px_-22px_rgba(27,55,39,.45)] transition hover:border-[#cbdccf] hover:shadow-[0_12px_30px_-22px_rgba(27,55,39,.5)] sm:rounded-[26px] sm:p-6">
      <button type="button" onClick={() => setSearchParams({ order: item._id })} className="order-card-trigger block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-[var(--text-primary)]">Order #{item._id.slice(-8).toUpperCase()}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{new Date(item.createdAt).toLocaleDateString(language === 'te' ? 'te-IN' : 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} <span className="px-1">·</span> {orderItems.length} {t(orderItems.length === 1 ? 'item' : 'items')}</p>
          </div>
          <StatusPill status={item.orderStatus} />
        </div>
        <div className={`mt-4 min-w-0 ${orderItems.length > 3 ? 'space-y-2' : 'flex items-center gap-3'}`}>
          <div className="flex shrink-0 items-center gap-1.5">
            {orderItems.slice(0, 3).map((orderItem, index) => {
              const product = orderItem.productId && typeof orderItem.productId === 'object' ? orderItem.productId : null
              const imageUrl = orderItem.imageUrl || product?.imageUrl || getCategoryPhoto(orderItem.productType || product?.productType || '')
              return <img key={`${orderItem.productName}-${index}`} src={imageUrl} alt="" loading="lazy" className="h-[58px] w-[58px] rounded-xl object-cover sm:h-[72px] sm:w-[72px]" />
            })}
            {orderItems.length > 3 && <span className="grid h-[58px] w-[48px] place-items-center rounded-xl bg-[#f3f5ef] text-sm font-semibold text-[var(--text-secondary)] sm:h-[72px] sm:w-[58px]">+{orderItems.length - 3}</span>}
          </div>
          <div className={`flex min-w-0 items-center gap-3 ${orderItems.length > 3 ? '' : 'flex-1'}`}>
            <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold leading-5 text-[var(--text-primary)] sm:text-base ${orderItems.length > 3 ? 'line-clamp-3' : 'line-clamp-2'}`}>{itemNames}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{orderItems.length} {t(orderItems.length === 1 ? 'item' : 'items')} <span className="px-1">·</span> {quantityLabel}</p>
            </div>
            {orderItems.length <= 3 && <ArrowRight size={19} className="shrink-0 text-[var(--brand-primary)]" />}
          </div>
          {orderItems.length > 3 && <ArrowRight size={19} className="ml-auto block text-[var(--brand-primary)]" />}
        </div>
      </button>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--surface-subtle)] pt-4">
        <div><p className="text-xs text-[var(--text-secondary)]">{t('Payment')} {paymentLabel}</p><p className="mt-0.5 text-2xl font-black tracking-tight text-[var(--brand-primary)]">{formatPrice(item.totalAmount)}</p></div>
        <button type="button" onClick={() => downloadInvoice(item)} disabled={Boolean(downloadingInvoiceId)} aria-label={t(downloadingInvoiceId === item._id ? 'Preparing invoice' : 'Download invoice')} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)] disabled:cursor-wait disabled:opacity-50"><ArrowDownToLine size={16} />{t(downloadingInvoiceId === item._id ? 'Preparing…' : 'Invoice')}</button>
      </div>
    </article>
    })}</div> : <div className="mt-5 rounded-[22px] border border-[var(--border-default)] bg-white px-5 py-14 text-center"><span className="text-4xl">🧺</span><h2 className="mt-3 font-bold text-[var(--text-secondary)]">{t('No orders to show')}</h2><p className="mt-1 text-sm text-slate-500">{t('When you place an order, it’ll find its way here.')}</p></div>}
    {listResponse?.pagination?.pages > 1 && <div className="mt-6 flex items-center justify-center gap-3"><button disabled={page <= 1 || isLoading} onClick={() => setPage((current) => current - 1)} className="rounded-xl border border-[#cdddc8] bg-white px-4 py-2.5 text-sm font-bold text-[var(--status-success)] disabled:opacity-40">{t('Previous')}</button><span className="text-xs text-[var(--text-secondary)]">{t('Page')} {page} {t('of')} {listResponse.pagination.pages}</span><button disabled={page >= listResponse.pagination.pages || isLoading} onClick={() => setPage((current) => current + 1)} className="rounded-xl border border-[#cdddc8] bg-white px-4 py-2.5 text-sm font-bold text-[var(--status-success)] disabled:opacity-40">{t('Next')}</button></div>}
    </div>
  </>
}
