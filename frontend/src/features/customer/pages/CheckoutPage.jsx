import { Link } from 'react-router-dom'
import { ArrowLeft, Banknote, CalendarDays, Clock3, CreditCard, MapPin, Plus, ShieldCheck, Smartphone, Store, X } from 'lucide-react'
import CookingLoader from '../components/CookingLoader.jsx'
import { useCheckoutFlow } from '../hooks/useCheckoutFlow.js'
import { getErrorMessage } from '../utils.js'

export default function CheckoutPage({ onLogin, onOpenCart, onToast }) {
  const {
    token,
    selectedStore,
    profileLoading,
    profileError,
    cartLoading,
    cartError,
    addressModalOpen,
    setAddressModalOpen,
    newAddress,
    setNewAddress,
    addressError,
    setAddressError,
    orderType,
    setOrderType,
    pickupDate,
    setPickupDate,
    pickupAt,
    setPickupAt,
    paymentMethod,
    setPaymentMethod,
    error,
    paymentBusy,
    addresses,
    selectedAddressId,
    mustAddAddress,
    pickupSlotsLoading,
    pickupSlotsError,
    pickupSlots,
    selectedPickupSlotAvailable,
    items,
    hasUnavailableItems,
    loading,
    saveCheckoutAddress,
    submitOrder,
    formatPrice,
    addressState,
    checkoutPaymentState,
    cart,
  } = useCheckoutFlow({ onToast })

  if (!token) {
    return (
      <section className="mx-auto max-w-2xl px-5 py-16 text-center">
        <span className="text-5xl">🛍️</span>
        <h1 className="mt-4 text-2xl font-black text-[var(--text-primary)]">Your basket is ready when you are</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in to view your live basket, choose an address and check out securely.</p>
        <button onClick={onLogin} className="mt-6 rounded-xl bg-[var(--brand-primary)] px-6 py-3 text-sm font-bold text-white hover:bg-[var(--brand-primary-hover)]">Sign in to continue</button>
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-primary)] hover:text-[var(--brand-primary-hover)]">
        <ArrowLeft size={16} /> Keep shopping
      </Link>
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_390px]">
        <div>
          <div className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--brand-primary)]">One last step</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--text-primary)]">Checkout</h1>
            <p className="mt-1 text-sm text-slate-500">Freshness is on its way.</p>
          </div>

          <section className="rounded-[22px] border border-[var(--border-default)] bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--brand-primary)]"><Store size={17} /></span>
              <div>
                <h2 className="font-bold text-[var(--text-primary)]">How would you like your order?</h2>
                <p className="text-xs text-slate-500">Choose delivery or collect it from the store.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { value: 'delivery', label: 'Delivery', detail: 'Bring the order to your address', icon: MapPin },
                { value: 'pickup', label: 'Store pickup', detail: 'Choose a 30-minute collection slot', icon: Store },
              ].map(({ value, label, detail, icon: Icon }) => (
                <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${orderType === value ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : 'border-[var(--border-default)] hover:border-[var(--brand-primary)]'}`}>
                  <input type="radio" name="orderType" value={value} checked={orderType === value} onChange={() => { setOrderType(value); if (value === 'delivery') setPickupAt(''); }} className="mt-1 accent-[var(--brand-primary)]" />
                  <Icon size={18} className="mt-0.5 shrink-0 text-[var(--brand-primary)]" />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">{label}</span>
                    <span className="mt-1 block text-xs text-[var(--text-secondary)]">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {orderType === 'delivery' ? (
            <section className="mt-4 rounded-[22px] border border-[var(--border-default)] bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--brand-primary)]"><MapPin size={17} /></span>
                <div>
                  <h2 className="font-bold text-[var(--text-primary)]">Delivery address</h2>
                  <p className="text-xs text-slate-500">Choose where we should bring your order.</p>
                </div>
              </div>
              {profileError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{getErrorMessage(profileError)}</p>}
              {profileLoading ? (
                <p className="mt-5 text-sm text-slate-500">Loading saved addresses…</p>
              ) : (
                <>
                  <div className="mt-5 space-y-2">
                    {addresses.map((address) => (
                      <label key={address._id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selectedAddressId === address._id ? 'border-[var(--brand-primary)] bg-[var(--status-danger-soft)]' : 'border-[var(--border-default)] hover:border-[var(--border-default)]'}`}>
                        <input type="radio" name="address" checked={selectedAddressId === address._id} onChange={() => setAddressId(address._id)} className="mt-1 accent-[var(--brand-primary)]" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-[var(--text-primary)]">{address.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{address.fullAddress}{address.landmark ? ` · ${address.landmark}` : ''} · {address.pincode}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button type="button" onClick={() => { setAddressError(''); setAddressModalOpen(true) }} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-primary)] hover:text-[var(--brand-primary-hover)]"><Plus size={16} /> Add a new address</button>
                </>
              )}
            </section>
          ) : (
            <section className="mt-4 rounded-[22px] border border-[var(--border-default)] bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--brand-primary)]"><CalendarDays size={17} /></span>
                <div>
                  <h2 className="font-bold text-[var(--text-primary)]">Choose a pickup time</h2>
                  <p className="text-xs text-slate-500">Available in 30-minute slots · India Standard Time.</p>
                </div>
              </div>
              {!selectedStore?._id && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Select a store before choosing pickup.</p>}
              <label className="mt-4 block max-w-xs text-xs font-semibold text-[var(--text-secondary)]">
                PICKUP DATE
                <input type="date" min={new Date().toISOString().slice(0, 10)} value={pickupDate} onChange={(event) => { setPickupDate(event.target.value); setPickupAt('') }} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
              </label>
              {pickupSlotsError && <p role="alert" className="mt-4 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{getErrorMessage(pickupSlotsError)}</p>}
              {pickupSlotsLoading ? (
                <p className="mt-4 text-sm text-[var(--text-secondary)]">Loading available pickup times…</p>
              ) : pickupSlots.length ? (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {pickupSlots.map((slot) => (
                    <label key={slot.startAt} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${pickupAt === slot.startAt ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]' : 'border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]'}`}>
                      <input type="radio" name="pickupSlot" value={slot.startAt} checked={pickupAt === slot.startAt} onChange={() => setPickupAt(slot.startAt)} className="sr-only" />
                      <Clock3 size={14} />{new Date(slot.startAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })} – {new Date(slot.endAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}
                    </label>
                  ))}
                </div>
              ) : !pickupSlotsError && selectedStore?._id && (
                <p className="mt-4 rounded-xl bg-[var(--bg-app)] p-3 text-sm text-[var(--text-secondary)]">No future pickup slots are available for this date. Please choose another date.</p>
              )}
            </section>
          )}

          <section className="mt-4 rounded-[22px] border border-[var(--border-default)] bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--brand-primary)]"><CreditCard size={17} /></span>
              <div>
                <h2 className="font-bold text-[var(--text-primary)]">Payment method</h2>
                <p className="text-xs text-slate-500">Choose how you’d like to pay.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${paymentMethod === 'upi' ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : 'border-[var(--border-default)] hover:border-[var(--brand-primary)]'}`}>
                <input type="radio" name="paymentMethod" value="upi" checked={paymentMethod === 'upi'} onChange={() => setPaymentMethod('upi')} className="mt-1 accent-[var(--brand-primary)]" />
                <Smartphone size={18} className="mt-0.5 shrink-0 text-[var(--brand-primary)]" />
                <span>
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">UPI</span>
                  <span className="mt-1 block text-xs text-[var(--text-secondary)]">Pay securely online with Razorpay.</span>
                </span>
              </label>
              <div aria-disabled="true" className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-[#eee9e4] bg-[#faf9f7] p-4 opacity-65">
                <input type="radio" name="paymentMethod" value="cod" disabled className="mt-1 accent-[var(--brand-primary)]" />
                <Banknote size={18} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" />
                <span>
                  <span className="block text-sm font-semibold text-[var(--text-secondary)]">Cash on delivery</span>
                  <span className="mt-1 block text-xs text-[var(--text-secondary)]">Coming soon</span>
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--bg-app)] p-3 text-xs text-slate-500"><ShieldCheck size={16} className="shrink-0 text-[var(--brand-primary)]" />Your UPI payment is securely verified by NalliBokka’s server.</div>
          </section>
        </div>

        <aside className="h-fit rounded-[22px] border border-[var(--border-default)] bg-white p-5 sm:p-6 lg:sticky lg:top-28">
          <h2 className="font-extrabold text-[var(--text-primary)]">Order summary</h2>
          {selectedStore && <p className="mt-1 text-xs text-slate-500">From {selectedStore.storeName}</p>}
          {loading ? (
            <CookingLoader compact label="Refreshing your basket…" />
          ) : cartError ? (
            <p role="alert" className="mt-4 text-sm text-rose-800">{getErrorMessage(cartError)} <button onClick={onOpenCart} className="underline">View basket</button></p>
          ) : items.length === 0 ? (
            <div className="mt-5 rounded-xl bg-[#f5f7f1] p-4 text-sm text-slate-500">Your basket is empty. <Link to="/" className="font-bold text-[var(--text-secondary)] underline">Shop now</Link></div>
          ) : (
            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto border-b border-[var(--surface-subtle)] pb-4">
              {items.map((item) => (
                <div key={item.itemId} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[var(--status-success)]">{item.productName}</span>
                    <span className="text-xs text-slate-400">{item.selectedQuantity} {item.selectionType === 'weight' ? 'kg' : item.selectionType === 'pieces' ? 'pieces' : item.selectedPackLabel}</span>
                    {!item.available && <span className="block text-[10px] text-rose-700">{item.issue || 'Unavailable'}</span>}
                  </span>
                  <span className="font-bold text-[var(--text-secondary)]">{item.available ? formatPrice(item.lineTotal) : '—'}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-between text-sm"><span className="text-slate-500">Total</span><span className="font-extrabold text-[var(--text-secondary)]">{cart?.total == null ? '—' : formatPrice(cart.total)}</span></div>
          {hasUnavailableItems && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Remove or resolve unavailable items from your basket before checkout.</p>}
          {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-800">{error}</p>}
          <p className="mt-3 text-center text-[10px] leading-4 text-[var(--text-secondary)]">Your order is only created after payment is confirmed.</p>
          <button onClick={submitOrder} disabled={loading || paymentBusy || checkoutPaymentState.isLoading || (orderType === 'delivery' ? !selectedAddressId : !selectedPickupSlotAvailable) || items.length === 0 || hasUnavailableItems || Boolean(cartError)} className="button-strong mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45">{paymentBusy || checkoutPaymentState.isLoading ? 'Opening secure payment…' : 'Complete payment to place order'}</button>
          <p className="mt-3 text-center text-[10px] leading-4 text-slate-400">Order total is confirmed by the store at checkout. Card details are never stored here.</p>
        </aside>
      </div>

      {(addressModalOpen || mustAddAddress) && (
        <div className="fixed inset-0 z-[70] grid items-end bg-[var(--text-primary)]/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="checkout-address-title" className="mx-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[24px] bg-[var(--bg-app)] p-5 shadow-2xl sm:rounded-[24px] sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--status-danger-soft)] text-[var(--brand-primary)]"><MapPin size={18} /></span>
                <h2 id="checkout-address-title" className="font-display text-xl font-medium text-[var(--text-primary)]">Add a delivery address</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Where should we bring your order?</p>
              </div>
              {addresses.length > 0 && <button type="button" onClick={() => setAddressModalOpen(false)} aria-label="Close add address" className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--status-danger-soft)]"><X size={19} /></button>}
            </div>
            <form onSubmit={saveCheckoutAddress} className="mt-5 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)]">LABEL<input required maxLength={40} value={newAddress.label} onChange={(event) => setNewAddress({ ...newAddress, label: event.target.value })} placeholder="Home" className="mt-1.5 h-11 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" /></label>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">PINCODE<input required pattern="[0-9]{6}" inputMode="numeric" maxLength={6} value={newAddress.pincode} onChange={(event) => setNewAddress({ ...newAddress, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="500001" className="mt-1.5 h-11 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" /></label>
                <label className="text-xs font-semibold text-[var(--text-secondary)] sm:col-span-2">FULL ADDRESS<textarea required minLength={5} maxLength={500} rows={3} value={newAddress.fullAddress} onChange={(event) => setNewAddress({ ...newAddress, fullAddress: event.target.value })} placeholder="Flat, street, area, city" className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" /></label>
                <label className="text-xs font-semibold text-[var(--text-secondary)] sm:col-span-2">LANDMARK <span className="font-normal text-[var(--text-secondary)]">(optional)</span><input maxLength={200} value={newAddress.landmark} onChange={(event) => setNewAddress({ ...newAddress, landmark: event.target.value })} placeholder="Near the park" className="mt-1.5 h-11 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" /></label>
              </div>
              {addressError && <p role="alert" className="rounded-lg bg-[var(--status-danger-soft)] p-3 text-xs text-[var(--status-danger)]">{addressError}</p>}
              <button disabled={addressState.isLoading} className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--brand-primary)] text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60">{addressState.isLoading ? 'Saving address…' : 'Save address'}</button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
