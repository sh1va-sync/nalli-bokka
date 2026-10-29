import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { ArrowRight, Minus, Plus, ShoppingBasket, Trash2, X } from 'lucide-react'
import { removeGuestItem, updateGuestItem } from '../../cart/cartSlice.js'
import { useGetProductsQuery, useRemoveCartItemMutation, useUpdateCartItemMutation } from '../../api/api.js'
import { formatPrice, formatSelection, getErrorMessage } from '../utils.js'
import { getCategoryPhoto } from './categoryAssets.js'
import ProductCard from './ProductCard.jsx'

function estimatedTotal(item) {
  const product = item.product || item
  if (item.lineTotal != null) return item.lineTotal
  if (item.selectionType === 'weight') return (product.pricePerKg || 0) * item.selectedQuantity
  if (item.selectionType === 'pieces') return (product.pricePerKg || 0) * (product.pieceWeightGrams || 0) / 1000 * item.selectedQuantity
  const pack = product.packs?.find(({ label }) => label === item.selectedPackLabel) || product.packs?.[0]
  return (pack?.price || 0) * item.selectedQuantity
}

export default function CartDrawer({ open, onClose, items, isGuest, onLogin, onSyncGuest, pageMode = false }) {
  const dispatch = useDispatch()
  const selectedStore = useSelector((state) => state.selectedStore)
  const [updateItem] = useUpdateCartItemMutation()
  const [removeItem] = useRemoveCartItemMutation()
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const unavailable = !isGuest && items.some((item) => item.needsSync || !item.available)
  const total = items.reduce((sum, item) => sum + estimatedTotal(item), 0)
  const { data: recommendationsResponse } = useGetProductsQuery(
    { storeId: selectedStore?._id, page: 1, limit: 12 },
    { skip: !pageMode || !selectedStore?._id || items.length === 0 },
  )
  const cartProductIds = new Set(items.map((item) => String(item.product?._id || item.productId || '')))
  const recommendations = (recommendationsResponse?.data || [])
    .filter((product) => !cartProductIds.has(String(product._id)) && product.inStock !== false)
    .slice(0, 8)

  async function changeQuantity(item, amount) {
    setError('')
    const current = Number(item.selectedQuantity)
    const next = current + amount
    if (next <= 0) {
      await deleteItem(item)
      return
    }
    try {
      if (isGuest || item.needsSync) {
        dispatch(updateGuestItem({ key: item.key, selectedQuantity: Number(next.toFixed(2)) }))
      } else {
        await updateItem({
          itemId: item.itemId,
          selectionType: item.selectionType,
          selectedQuantity: next,
          ...(item.selectedPackLabel ? { selectedPackLabel: item.selectedPackLabel } : {}),
        }).unwrap()
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  async function deleteItem(item) {
    setError('')
    try {
      if (isGuest || item.needsSync) dispatch(removeGuestItem(item.key))
      else await removeItem(item.itemId).unwrap()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  async function syncPendingItems() {
    setError('')
    setSyncing(true)
    try {
      const message = await onSyncGuest()
      if (message) setError(message)
    } finally {
      setSyncing(false)
    }
  }

  if (!pageMode && !open) return null
  return (
    <div className={pageMode ? 'mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6 sm:pt-8 lg:px-8' : 'customer-cart-backdrop fixed inset-0 z-40 bg-[var(--text-primary)]/40 backdrop-blur-[2px]'} role={pageMode ? undefined : 'presentation'} onMouseDown={pageMode ? undefined : (event) => { if (event.target === event.currentTarget) onClose() }}>
      {pageMode ? <>
        <header className="relative isolate mb-5 overflow-hidden rounded-[24px] bg-gradient-to-r from-[#edf5ee] via-[#eaf4eb] to-[#e1efe4] px-5 py-6 sm:mb-7 sm:rounded-[30px] sm:px-8 sm:py-8">
          <img src="/hero/green-market.svg" alt="" className="pointer-events-none absolute -right-7 bottom-0 h-[118%] w-[54%] object-contain object-right-bottom opacity-80 sm:right-0 sm:h-[125%] sm:w-[42%]" />
          <p className="relative z-10 text-[10px] font-bold uppercase tracking-[.18em] text-[var(--brand-primary)] sm:text-xs">Fresh items, ready for your home.</p>
          <h1 id="basket-title" className="relative z-10 mt-1 text-3xl font-black tracking-[-.045em] text-[var(--text-primary)] sm:mt-2 sm:text-5xl">Your cart</h1>
          {items.length > 0 && <p className="relative z-10 mt-2 text-xs font-medium text-[var(--text-secondary)] sm:text-base">{items.length} {items.length === 1 ? 'item' : 'items'} from {selectedStore?.storeName || 'your store'}</p>}
        </header>
        {error && <p role="alert" className="mb-4 rounded-xl bg-[var(--status-danger-soft)] px-4 py-3 text-sm text-[var(--status-danger)]">{error}</p>}
        {unavailable && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">{items.some((item) => item.needsSync) ? 'Some saved items still need to sync to your account before checkout.' : 'Some items aren’t available at the current price. Remove them before checkout.'}</div>}
        {items.length === 0 ? <div className="grid min-h-[300px] content-center justify-items-center rounded-[24px] border border-[var(--border-default)] bg-white px-6 py-10 text-center shadow-sm">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><ShoppingBasket size={32} /></span>
          <h2 className="mt-5 text-xl font-extrabold text-[var(--text-primary)]">Your cart is empty</h2>
          <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">Add something fresh and lovely from the shop.</p>
          <button type="button" onClick={onClose} className="button-strong mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold">Explore the shop <ArrowRight size={17} /></button>
        </div> : <>
          <section aria-label="Cart items" className="overflow-hidden rounded-[24px] border border-[var(--border-default)] bg-white px-4 shadow-[0_8px_24px_-20px_rgba(17,44,31,.38)] sm:px-6">
            {items.map((item) => {
              const product = item.product || item
              const unavailableItem = item.available === false
              const step = item.selectionType === 'weight' ? 0.25 : 1
              const imageUrl = product.imageUrl || getCategoryPhoto(product.productType || item.productName)
              return <article key={item.itemId || item.key} className="flex gap-3 border-b border-[var(--border-default)] py-4 last:border-b-0 sm:gap-5 sm:py-5">
                <div className="h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[14px] bg-[#f1f0eb] sm:h-[96px] sm:w-[96px] sm:rounded-[17px]">
                  <img src={imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = getCategoryPhoto(product.productType || item.productName) }} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-extrabold leading-5 text-[var(--text-primary)] sm:text-lg">{item.productName || product.productName}</h2>
                      <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">{formatSelection(item)}</p>
                    </div>
                    <button type="button" onClick={() => deleteItem(item)} aria-label={`Remove ${item.productName || product.productName} from cart`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--status-danger-soft)] hover:text-[var(--status-danger)]">
                      <Trash2 size={17} />
                    </button>
                  </div>
                  {item.needsSync && <p className="mt-1 text-[10px] font-semibold text-amber-700">Waiting to sync</p>}
                  {unavailableItem && <p className="mt-1 text-[10px] font-semibold text-rose-700">{item.issue || 'No longer available'}</p>}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 sm:mt-3">
                    <div className="flex h-9 items-center gap-1 rounded-full border border-[#dce9df] bg-[#f1f7f2] px-1 sm:h-11 sm:gap-2">
                      <button type="button" onClick={() => changeQuantity(item, -step)} aria-label="Decrease quantity" className="grid h-7 w-8 place-items-center rounded-full text-[var(--text-primary)] transition hover:bg-white sm:h-9 sm:w-10"><Minus size={16} /></button>
                      <span className="min-w-5 text-center text-sm font-bold text-[var(--text-primary)]">{item.selectedQuantity}</span>
                      <button type="button" onClick={() => changeQuantity(item, step)} aria-label="Increase quantity" className="grid h-7 w-8 place-items-center rounded-full text-[var(--text-primary)] transition hover:bg-white sm:h-9 sm:w-10"><Plus size={17} /></button>
                    </div>
                    <span className="shrink-0 text-sm font-extrabold text-[var(--text-primary)] sm:text-lg">{unavailableItem ? 'Unavailable' : formatPrice(estimatedTotal(item))}</span>
                  </div>
                </div>
              </article>
            })}
          </section>

          {recommendations.length > 0 && <section className="mt-5 rounded-[24px] bg-[#eaf4eb] p-4 sm:mt-6 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-extrabold text-[var(--text-primary)] sm:text-xl">You might also like</h2>
              <Link to="/" onClick={onClose} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--brand-primary)] sm:text-sm">See all <ArrowRight size={16} /></Link>
            </div>
            <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible lg:grid-cols-4">
              {recommendations.map((product) => <div key={product._id} className="w-[148px] shrink-0 sm:w-auto"><ProductCard product={product} /></div>)}
            </div>
          </section>}

          <section aria-label="Bill details" className="mt-5 rounded-[22px] bg-[#eaf4eb] p-4 sm:mt-6 sm:p-6">
            <h2 className="text-lg font-extrabold text-[var(--text-primary)] sm:text-xl">Bill details</h2>
            <div className="mt-3 flex justify-between gap-4 text-sm text-[var(--text-secondary)] sm:text-base">
              <span>Items total ({items.length} {items.length === 1 ? 'item' : 'items'}){isGuest && <span className="ml-1 text-[10px]">(estimate)</span>}</span>
              <span className="shrink-0 font-bold text-[var(--text-primary)]">{formatPrice(total)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-4 text-sm text-[var(--text-secondary)] sm:text-base"><span>Delivery fee</span><span className="shrink-0 font-semibold text-[var(--text-secondary)]">Calculated at checkout</span></div>
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-[#cbded0] pt-4">
              <span className="text-base font-extrabold text-[var(--text-primary)] sm:text-lg">Total amount</span>
              <span className="text-2xl font-black tracking-[-.03em] text-[#103c30] sm:text-3xl">{formatPrice(total)}</span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[var(--text-secondary)]">Final prices and delivery fee are confirmed by the store at checkout.</p>
          </section>
          {!isGuest && items.some((item) => item.needsSync) ? <button disabled={syncing} onClick={syncPendingItems} className="mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-[16px] bg-[var(--brand-primary)] text-base font-bold text-white shadow-[0_8px_18px_-8px_rgba(23,97,73,.55)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-60">{syncing ? 'Syncing saved items…' : 'Sync saved items'} <ArrowRight size={21} /></button> : !isGuest && unavailable ? <button disabled className="mt-4 flex h-14 w-full items-center justify-center rounded-[16px] bg-[#e3e1dc] text-base font-semibold text-[var(--text-secondary)]">Resolve unavailable items</button> : isGuest ? <button onClick={onLogin} className="button-strong mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-[16px] text-base font-bold shadow-[0_8px_18px_-8px_rgba(23,97,73,.55)]">Sign in to checkout <ArrowRight size={21} /></button> : <Link to="/checkout" className="button-strong mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-[16px] text-base font-bold shadow-[0_8px_18px_-8px_rgba(23,97,73,.55)]">Proceed to checkout <ArrowRight size={21} /></Link>}
        </>}
      </> : <aside className="customer-cart-panel absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[var(--surface-subtle)] bg-white shadow-2xl" aria-labelledby="basket-title">
        <div className="flex items-center justify-between border-b border-[var(--surface-subtle)] px-5 py-4 sm:px-8 sm:py-5">
          <h2 id="basket-title" className="text-[25px] font-semibold tracking-[-.035em] text-[var(--text-primary)]">Your cart</h2>
          <button onClick={onClose} aria-label="Close cart" className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[#f2f1ed]"><X size={23} /></button>
        </div>
        {error && <p role="alert" className="mx-6 mt-4 rounded-xl bg-[var(--status-danger-soft)] px-3 py-2 text-sm text-[var(--status-danger)] sm:mx-8">{error}</p>}
        {unavailable && <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 sm:mx-8">{items.some((item) => item.needsSync) ? 'Some saved items still need to sync to your account before checkout.' : 'Some items aren’t available at the current price. Remove them before checkout.'}</div>}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
          {items.length === 0 ? <div className="grid h-full content-center justify-items-center text-center"><span className="grid h-20 w-20 place-items-center rounded-[28px] bg-[#f3f1ed] text-[var(--text-secondary)]"><ShoppingBasket size={32} /></span><h3 className="mt-5 font-semibold text-[var(--text-primary)]">Your cart is empty</h3><p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">Add something fresh and lovely from the shop.</p><button onClick={onClose} className="mt-5 rounded-lg bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white">Explore the shop</button></div> : (
            <div className="space-y-4">
              {items.map((item) => {
                const product = item.product || item
                const unavailableItem = item.available === false
                const step = item.selectionType === 'weight' ? 0.25 : 1
                return <article key={item.itemId || item.key} className="flex gap-4 rounded-[18px] border border-[#eeede9] bg-white p-3.5 shadow-[0_2px_8px_-6px_rgba(48,49,39,.3)] sm:gap-5 sm:p-4">
                  <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[13px] bg-[#f1f0eb] sm:h-[76px] sm:w-[76px]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <img src={getCategoryPhoto(product.productType)} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-medium leading-6 text-[var(--text-primary)]">{item.productName || product.productName} — {formatSelection(item)}</h3>
                    {item.needsSync && <p className="mt-1 text-[10px] font-semibold text-amber-700">Waiting to sync</p>}
                    {unavailableItem && <p className="mt-1 text-[10px] font-semibold text-rose-700">{item.issue || 'No longer available'}</p>}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex h-10 items-center gap-3 rounded-full border border-[var(--border-default)] bg-[var(--bg-app)] px-2 shadow-sm">
                        <button onClick={() => changeQuantity(item, -step)} aria-label="Decrease quantity" className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"><Minus size={16} /></button>
                        <span className="min-w-5 text-center text-sm font-semibold text-[var(--text-primary)]">{item.selectedQuantity}</span>
                        <button onClick={() => changeQuantity(item, step)} aria-label="Increase quantity" className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"><Plus size={16} /></button>
                      </div>
                      <span className="text-base font-semibold text-[var(--text-primary)]">{unavailableItem ? 'Unavailable' : formatPrice(estimatedTotal(item))}</span>
                    </div>
                  </div>
                </article>
              })}
            </div>
          )}
        </div>
        {items.length > 0 && <div className="border-t border-[var(--border-default)] bg-[var(--bg-app)] px-5 pb-5 pt-4 sm:px-8 sm:pb-6">
          <div className="flex justify-between text-sm text-[var(--text-secondary)]"><span>Subtotal {isGuest && <span className="text-[10px]">(estimate)</span>}</span><span className="text-[22px] font-semibold tracking-[-.025em] text-[var(--text-primary)]">{formatPrice(total)}</span></div>
          <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">Final prices are confirmed with the store when your cart is refreshed.</p>
          {!isGuest && items.some((item) => item.needsSync) ? <button disabled={syncing} onClick={syncPendingItems} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--brand-primary)] text-base font-semibold shadow-sm hover:bg-[var(--brand-primary-hover)] disabled:opacity-60">{syncing ? 'Syncing saved items…' : 'Sync saved items'} <ArrowRight size={17} /></button> : !isGuest && unavailable ? <button disabled className="mt-4 flex h-14 w-full items-center justify-center rounded-[14px] bg-[#e3e1dc] text-base font-semibold text-[var(--text-secondary)]">Resolve unavailable items</button> : isGuest ? <button onClick={onLogin} className="button-strong mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--brand-primary)] text-base font-semibold shadow-sm hover:bg-[var(--brand-primary-hover)]">Sign in to checkout <ArrowRight size={17} /></button> : <Link to="/checkout" onClick={onClose} className="button-strong mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--brand-primary)] text-base font-semibold shadow-sm hover:bg-[var(--brand-primary-hover)]">Proceed to checkout</Link>}
        </div>}
      </aside>}
    </div>
  )
}
