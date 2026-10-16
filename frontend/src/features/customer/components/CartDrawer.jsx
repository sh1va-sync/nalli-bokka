import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { ArrowRight, Minus, Plus, ShoppingBasket, X } from 'lucide-react'
import { removeGuestItem, updateGuestItem } from '../../cart/cartSlice.js'
import { useRemoveCartItemMutation, useUpdateCartItemMutation } from '../../api/api.js'
import { formatPrice, formatSelection, getErrorMessage } from '../utils.js'
import { getCategoryPhoto } from './categoryAssets.js'

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
  const [updateItem] = useUpdateCartItemMutation()
  const [removeItem] = useRemoveCartItemMutation()
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const unavailable = !isGuest && items.some((item) => item.needsSync || !item.available)
  const total = items.reduce((sum, item) => sum + estimatedTotal(item), 0)

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
    <div className={pageMode ? 'mx-auto max-w-3xl px-4 pb-8 pt-5 sm:px-6 sm:pt-9' : 'fixed inset-0 z-40 bg-[var(--text-primary)]/40 backdrop-blur-[2px]'} role={pageMode ? undefined : 'presentation'} onMouseDown={pageMode ? undefined : (event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className={pageMode ? 'flex min-h-[calc(100dvh-170px)] flex-col overflow-hidden rounded-[24px] border border-[var(--border-default)] bg-white shadow-[0_8px_30px_-20px_rgba(17,44,31,.42)]' : 'absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[var(--surface-subtle)] bg-white shadow-2xl'} aria-labelledby="basket-title">
        <div className="flex items-center justify-between border-b border-[var(--surface-subtle)] px-5 py-4 sm:px-8 sm:py-5">
          <h2 id="basket-title" className="text-[25px] font-semibold tracking-[-.035em] text-[var(--text-primary)]">Your cart</h2>
          <button onClick={onClose} aria-label={pageMode ? 'Continue shopping' : 'Close cart'} className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[#f2f1ed]">{pageMode ? <ArrowRight className="rotate-180" size={21} /> : <X size={23} />}</button>
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
          {!isGuest && items.some((item) => item.needsSync) ? <button disabled={syncing} onClick={syncPendingItems} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--brand-primary)] text-base font-semibold shadow-sm hover:bg-[var(--brand-primary-hover)] disabled:opacity-60">{syncing ? 'Syncing saved items…' : 'Sync saved items'} <ArrowRight size={17} /></button> : !isGuest && unavailable ? <button disabled className="mt-4 flex h-14 w-full items-center justify-center rounded-[14px] bg-[#e3e1dc] text-base font-semibold text-[var(--text-secondary)]">Resolve unavailable items</button> : isGuest ? <button onClick={onLogin} className="button-strong mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--brand-primary)] text-base font-semibold shadow-sm hover:bg-[var(--brand-primary-hover)]">Sign in to checkout <ArrowRight size={17} /></button> : <Link to="/checkout" onClick={pageMode ? undefined : onClose} className="button-strong mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--brand-primary)] text-base font-semibold shadow-sm hover:bg-[var(--brand-primary-hover)]">Proceed to checkout</Link>}
        </div>}
      </aside>
    </div>
  )
}
