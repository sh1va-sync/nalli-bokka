import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { ArrowLeft, Banknote, CreditCard, MapPin, Plus, ShieldCheck, Smartphone, X } from 'lucide-react'
import { useAddAddressMutation, useCreateCheckoutPaymentMutation, useGetCartQuery, useGetProfileQuery, useMarkCheckoutPaymentFailedMutation, useVerifyPaymentMutation } from '../../api/api.js'
import { createUuid, formatPrice, getErrorMessage, loadRazorpaySdk } from '../utils.js'

export default function CheckoutPage({ onLogin, onOpenCart, onToast }) {
  const navigate = useNavigate()
  const token = useSelector((state) => state.auth.token)
  const selectedStore = useSelector((state) => state.selectedStore)
  const { data: profileResponse, isLoading: profileLoading, error: profileError } = useGetProfileQuery(undefined, { skip: !token })
  const { data: cartResponse, isLoading: cartLoading, error: cartError } = useGetCartQuery(undefined, { skip: !token })
  const [createCheckoutPayment, checkoutPaymentState] = useCreateCheckoutPaymentMutation()
  const [markPaymentFailed] = useMarkCheckoutPaymentFailedMutation()
  const [verifyPayment] = useVerifyPaymentMutation()
  const [addAddress, addressState] = useAddAddressMutation()
  const [addressId, setAddressId] = useState('')
  const [addressModalOpen, setAddressModalOpen] = useState(false)
  const [newAddress, setNewAddress] = useState({ label: 'Home', fullAddress: '', landmark: '', pincode: '' })
  const [addressError, setAddressError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('upi')
  const [error, setError] = useState('')
  const [paymentBusy, setPaymentBusy] = useState(false)
  const paymentFailureNotified = useRef(false)
  const addresses = profileResponse?.data?.addresses || []
  const firstAddressId = addresses[0]?._id
  const selectedAddressId = addressId || firstAddressId || ''
  const mustAddAddress = !profileLoading && !profileError && addresses.length === 0
  const cart = cartResponse?.data
  const items = cart?.items || []
  const hasUnavailableItems = cart?.hasUnavailableItems || items.some((item) => !item.available)
  const loading = profileLoading || cartLoading

  async function saveCheckoutAddress(event) {
    event.preventDefault()
    setAddressError('')
    try {
      const response = await addAddress({
        ...newAddress,
        label: newAddress.label.trim(),
        fullAddress: newAddress.fullAddress.trim(),
        landmark: newAddress.landmark.trim(),
      }).unwrap()
      setAddressId(response.data._id)
      setNewAddress({ label: 'Home', fullAddress: '', landmark: '', pincode: '' })
      setAddressModalOpen(false)
    } catch (requestError) {
      setAddressError(getErrorMessage(requestError))
    }
  }

  async function handleFailedPayment(razorpayOrderId, title, message) {
    if (paymentFailureNotified.current) return
    paymentFailureNotified.current = true
    setPaymentBusy(false)
    setError(`${message} No order was placed.`)
    onToast({ type: 'error', title, message: `${message} No order was placed.` })
    try {
      await markPaymentFailed(razorpayOrderId).unwrap()
    } catch (requestError) {
      const statusMessage = `The payment failed and no order was placed, but its checkout status could not be updated: ${getErrorMessage(requestError)}`
      setError(statusMessage)
      onToast({ type: 'error', title: 'Payment status update failed', message: statusMessage })
    }
  }

  async function payForCheckout(payment) {
    setError('')
    paymentFailureNotified.current = false
    try {
      const loaded = await loadRazorpaySdk()
      if (!loaded || !window.Razorpay) {
        await handleFailedPayment(payment.razorpayOrderId, 'Unable to open payment', 'Razorpay Checkout could not be loaded. Please check your connection and try again.')
        return
      }
      const checkout = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: 'NalliBokka',
        description: 'NalliBokka order',
        order_id: payment.razorpayOrderId,
        prefill: { name: profileResponse?.data?.name, email: profileResponse?.data?.email, contact: profileResponse?.data?.phone },
        theme: { color: '#861923' },
        handler: async (response) => {
          paymentFailureNotified.current = true
          try {
            const result = await verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }).unwrap()
            paymentFailureNotified.current = true
            setPaymentBusy(false)
            onToast({ type: 'success', title: 'Order placed', message: 'Payment was successful. Your order is confirmed.' })
            navigate(`/orders?order=${result.data.orderId}`)
          } catch (verifyError) {
            paymentFailureNotified.current = true
            setPaymentBusy(false)
            const message = `Payment verification failed: ${getErrorMessage(verifyError)} Your payment may still be processing. Check your payment status before retrying.`
            setError(message)
            onToast({ type: 'error', title: 'Payment needs attention', message: getErrorMessage(verifyError) })
          }
        },
        modal: {
          ondismiss: () => {
            handleFailedPayment(payment.razorpayOrderId, 'Payment not completed', 'The payment window closed before payment was confirmed.')
          },
        },
      })
      checkout.on('payment.failed', (response) => {
        const message = response.error?.description || 'The payment could not be completed. Please try again.'
        handleFailedPayment(payment.razorpayOrderId, 'Payment failed', message)
      })
      checkout.open()
    } catch (requestError) {
      const message = getErrorMessage(requestError)
      await handleFailedPayment(payment.razorpayOrderId, 'Unable to start payment', message)
    }
  }

  async function submitOrder() {
    setError('')
    setPaymentBusy(true)
    try {
      const response = await createCheckoutPayment({
        addressId: selectedAddressId,
        storeId: selectedStore?._id,
        idempotencyKey: createUuid(),
      }).unwrap()
      await payForCheckout(response.data)
    } catch (requestError) {
      const message = getErrorMessage(requestError)
      setError(message)
      onToast({ type: 'error', title: 'Unable to start checkout', message })
      setPaymentBusy(false)
    }
  }

  if (!token) return <section className="mx-auto max-w-2xl px-5 py-16 text-center"><span className="text-5xl">🛍️</span><h1 className="mt-4 text-2xl font-black text-[#392824]">Your basket is ready when you are</h1><p className="mt-2 text-sm text-slate-500">Sign in to view your live basket, choose an address and check out securely.</p><button onClick={onLogin} className="mt-6 rounded-xl bg-[#861923] px-6 py-3 text-sm font-bold text-white hover:bg-[#70131c]">Sign in to continue</button></section>

  return <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
    <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#9b5148] hover:text-[#861923]"><ArrowLeft size={16} /> Keep shopping</Link>
    <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_390px]">
      <div>
        <div className="mb-6"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ad7669]">One last step</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[#392824]">Checkout</h1><p className="mt-1 text-sm text-slate-500">Freshness is on its way.</p></div>
        <section className="rounded-[22px] border border-[#eadfd7] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f7ece7] text-[#9b5148]"><MapPin size={17} /></span><div><h2 className="font-bold text-[#493631]">Delivery address</h2><p className="text-xs text-slate-500">Choose where we should bring your order.</p></div></div>
          {profileError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{getErrorMessage(profileError)}</p>}
          {profileLoading ? <p className="mt-5 text-sm text-slate-500">Loading saved addresses…</p> : <>
            <div className="mt-5 space-y-2">{addresses.map((address) => <label key={address._id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selectedAddressId === address._id ? 'border-[#d9aaa0] bg-[#fbf3ef]' : 'border-[#eadfd7] hover:border-[#d5b7aa]'}`}><input type="radio" name="address" checked={selectedAddressId === address._id} onChange={() => setAddressId(address._id)} className="mt-1 accent-[#861923]" /><span className="min-w-0"><span className="block text-sm font-bold text-[#493631]">{address.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{address.fullAddress}{address.landmark ? ` · ${address.landmark}` : ''} · {address.pincode}</span></span></label>)}</div>
            <button type="button" onClick={() => { setAddressError(''); setAddressModalOpen(true) }} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#861923] hover:text-[#70131c]"><Plus size={16} /> Add a new address</button>
          </>}
        </section>
        <section className="mt-4 rounded-[22px] border border-[#eadfd7] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f7ece7] text-[#9b5148]"><CreditCard size={17} /></span><div><h2 className="font-bold text-[#493631]">Payment method</h2><p className="text-xs text-slate-500">Choose how you’d like to pay.</p></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${paymentMethod === 'upi' ? 'border-[#d9aaa0] bg-[#fbf3ef]' : 'border-[#eadfd7] hover:border-[#d5b7aa]'}`}>
              <input type="radio" name="paymentMethod" value="upi" checked={paymentMethod === 'upi'} onChange={() => setPaymentMethod('upi')} className="mt-1 accent-[#861923]" />
              <Smartphone size={18} className="mt-0.5 shrink-0 text-[#9b5148]" />
              <span><span className="block text-sm font-semibold text-[#493631]">UPI</span><span className="mt-1 block text-xs text-[#82736d]">Pay securely online with Razorpay.</span></span>
            </label>
            <div aria-disabled="true" className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-[#eee9e4] bg-[#faf9f7] p-4 opacity-65">
              <input type="radio" name="paymentMethod" value="cod" disabled className="mt-1 accent-[#861923]" />
              <Banknote size={18} className="mt-0.5 shrink-0 text-[#9b8178]" />
              <span><span className="block text-sm font-semibold text-[#625650]">Cash on delivery</span><span className="mt-1 block text-xs text-[#8d8079]">Coming soon</span></span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#fbf7f1] p-3 text-xs text-slate-500"><ShieldCheck size={16} className="shrink-0 text-[#9b5148]" />Your UPI payment is securely verified by NalliBokka’s server.</div>
        </section>
      </div>
      <aside className="h-fit rounded-[22px] border border-[#eadfd7] bg-white p-5 sm:p-6 lg:sticky lg:top-28">
        <h2 className="font-extrabold text-[#493631]">Order summary</h2>
        {selectedStore && <p className="mt-1 text-xs text-slate-500">From {selectedStore.storeName}</p>}
        {loading ? <p className="mt-5 text-sm text-slate-500">Refreshing your basket…</p> : cartError ? <p role="alert" className="mt-4 text-sm text-rose-800">{getErrorMessage(cartError)} <button onClick={onOpenCart} className="underline">View basket</button></p> : items.length === 0 ? <div className="mt-5 rounded-xl bg-[#f5f7f1] p-4 text-sm text-slate-500">Your basket is empty. <Link to="/" className="font-bold text-[#4e8159] underline">Shop now</Link></div> : <div className="mt-4 max-h-64 space-y-3 overflow-y-auto border-b border-[#edf0e9] pb-4">{items.map((item) => <div key={item.itemId} className="flex justify-between gap-3 text-sm"><span className="min-w-0"><span className="block truncate font-semibold text-[#3b5540]">{item.productName}</span><span className="text-xs text-slate-400">{item.selectedQuantity} {item.selectionType === 'weight' ? 'kg' : item.selectionType === 'pieces' ? 'pieces' : item.selectedPackLabel}</span>{!item.available && <span className="block text-[10px] text-rose-700">{item.issue || 'Unavailable'}</span>}</span><span className="font-bold text-[#3b6545]">{item.available ? formatPrice(item.lineTotal) : '—'}</span></div>)}</div>}
        <div className="mt-4 flex justify-between text-sm"><span className="text-slate-500">Total</span><span className="font-extrabold text-[#2f5038]">{cart?.total == null ? '—' : formatPrice(cart.total)}</span></div>
        {hasUnavailableItems && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Remove or resolve unavailable items from your basket before checkout.</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-800">{error}</p>}
        <p className="mt-3 text-center text-[10px] leading-4 text-[#8b756c]">Your order is only created after payment is confirmed.</p>
        <button onClick={submitOrder} disabled={loading || paymentBusy || checkoutPaymentState.isLoading || !selectedAddressId || items.length === 0 || hasUnavailableItems || Boolean(cartError)} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#861923] text-sm font-bold text-white transition hover:bg-[#70131c] disabled:cursor-not-allowed disabled:opacity-45">{paymentBusy || checkoutPaymentState.isLoading ? 'Opening secure payment…' : 'Complete payment to place order'}</button>
        <p className="mt-3 text-center text-[10px] leading-4 text-slate-400">Order total is confirmed by the store at checkout. Card details are never stored here.</p>
      </aside>
    </div>
    {(addressModalOpen || mustAddAddress) && <div className="fixed inset-0 z-[70] grid items-end bg-[#302724]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="checkout-address-title" className="mx-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] bg-[#fbf7f1] p-5 shadow-2xl sm:rounded-[24px] sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div><span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f3e2dc] text-[#861923]"><MapPin size={18} /></span><h2 id="checkout-address-title" className="font-display text-xl font-medium text-[#392824]">Add a delivery address</h2><p className="mt-1 text-sm text-[#82736d]">Where should we bring your order?</p></div>
          {addresses.length > 0 && <button type="button" onClick={() => setAddressModalOpen(false)} aria-label="Close add address" className="rounded-full p-2 text-[#82736d] hover:bg-[#f3e2dc]"><X size={19} /></button>}
        </div>
        <form onSubmit={saveCheckoutAddress} className="mt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#76534a]">LABEL<input required maxLength={40} value={newAddress.label} onChange={(event) => setNewAddress({ ...newAddress, label: event.target.value })} placeholder="Home" className="mt-1.5 h-11 w-full rounded-lg border border-[#eadfd7] bg-white px-3 text-sm font-normal text-[#302724] outline-none focus:border-[#c98c7f]" /></label>
            <label className="text-xs font-semibold text-[#76534a]">PINCODE<input required pattern="[0-9]{6}" inputMode="numeric" maxLength={6} value={newAddress.pincode} onChange={(event) => setNewAddress({ ...newAddress, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="500001" className="mt-1.5 h-11 w-full rounded-lg border border-[#eadfd7] bg-white px-3 text-sm font-normal text-[#302724] outline-none focus:border-[#c98c7f]" /></label>
            <label className="text-xs font-semibold text-[#76534a] sm:col-span-2">FULL ADDRESS<textarea required minLength={5} maxLength={500} rows={3} value={newAddress.fullAddress} onChange={(event) => setNewAddress({ ...newAddress, fullAddress: event.target.value })} placeholder="Flat, street, area, city" className="mt-1.5 w-full resize-y rounded-lg border border-[#eadfd7] bg-white px-3 py-2 text-sm font-normal text-[#302724] outline-none focus:border-[#c98c7f]" /></label>
            <label className="text-xs font-semibold text-[#76534a] sm:col-span-2">LANDMARK <span className="font-normal text-[#9b8a80]">(optional)</span><input maxLength={200} value={newAddress.landmark} onChange={(event) => setNewAddress({ ...newAddress, landmark: event.target.value })} placeholder="Near the park" className="mt-1.5 h-11 w-full rounded-lg border border-[#eadfd7] bg-white px-3 text-sm font-normal text-[#302724] outline-none focus:border-[#c98c7f]" /></label>
          </div>
          {addressError && <p role="alert" className="rounded-lg bg-[#fbefec] p-3 text-xs text-[#8c4034]">{addressError}</p>}
          <button disabled={addressState.isLoading} className="flex h-12 w-full items-center justify-center rounded-xl bg-[#861923] text-sm font-semibold text-white hover:bg-[#70131c] disabled:opacity-55">{addressState.isLoading ? 'Saving address…' : 'Save address'}</button>
        </form>
      </section>
    </div>}
  </div>
}
