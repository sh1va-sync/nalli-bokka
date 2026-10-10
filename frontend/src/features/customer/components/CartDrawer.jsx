import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { ArrowRight, Minus, Plus, ShoppingBasket, X } from 'lucide-react'
import { removeGuestItem, updateGuestItem } from '../../cart/cartSlice.js'
import { useRemoveCartItemMutation, useUpdateCartItemMutation } from '../../api/api.js'
import { formatPrice, formatSelection, getErrorMessage } from '../utils.js'

function estimatedTotal(item) {
  const product = item.product || item
  if (item.lineTotal != null) return item.lineTotal
  if (item.selectionType === 'weight') return (product.pricePerKg || 0) * item.selectedQuantity
  if (item.selectionType === 'pieces') return (product.pricePerKg || 0) * (product.pieceWeightGrams || 0) / 1000 * item.selectedQuantity
  const pack = product.packs?.find(({ label }) => label === item.selectedPackLabel) || product.packs?.[0]
  return (pack?.price || 0) * item.selectedQuantity
}

export default function CartDrawer({ open, onClose, items, isGuest, onLogin, onSyncGuest }) {
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

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 bg-[#24251f]/40 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[#eeeae4] bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="basket-title">
        <div className="flex items-center justify-between border-b border-[#eeeae4] px-6 py-5 sm:px-8">
          <h2 id="basket-title" className="text-[25px] font-semibold tracking-[-.035em] text-[#292b26]">Your cart</h2>
          <button onClick={onClose} aria-label="Close cart" className="rounded-full p-2 text-[#77766f] hover:bg-[#f2f1ed]"><X size={23} /></button>
        </div>
        {error && <p role="alert" className="mx-6 mt-4 rounded-xl bg-[#fbf1ee] px-3 py-2 text-sm text-[#8c4034] sm:mx-8">{error}</p>}
        {unavailable && <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 sm:mx-8">{items.some((item) => item.needsSync) ? 'Some saved items still need to sync to your account before checkout.' : 'Some items aren’t available at the current price. Remove them before checkout.'}</div>}
        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {items.length === 0 ? <div className="grid h-full content-center justify-items-center text-center"><span className="grid h-20 w-20 place-items-center rounded-[28px] bg-[#f3f1ed] text-[#88877e]"><ShoppingBasket size={32} /></span><h3 className="mt-5 font-semibold text-[#34362f]">Your cart is empty</h3><p className="mt-1 max-w-xs text-sm text-[#88877e]">Add something fresh and lovely from the shop.</p><button onClick={onClose} className="mt-5 rounded-lg bg-[#861923] px-5 py-3 text-sm font-semibold text-white">Explore the shop</button></div> : (
            <div className="space-y-4">
              {items.map((item) => {
                const product = item.product || item
                const unavailableItem = item.available === false
                const step = item.selectionType === 'weight' ? 0.25 : 1
                return <article key={item.itemId || item.key} className="flex gap-4 rounded-[18px] border border-[#eeede9] bg-white p-3.5 shadow-[0_2px_8px_-6px_rgba(48,49,39,.3)] sm:gap-5 sm:p-4">
                  <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[13px] bg-[#f1f0eb] sm:h-[76px] sm:w-[76px]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-3xl">🥬</span>}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-medium leading-6 text-[#292b26]">{item.productName || product.productName} — {formatSelection(item)}</h3>
                    {item.needsSync && <p className="mt-1 text-[10px] font-semibold text-amber-700">Waiting to sync</p>}
                    {unavailableItem && <p className="mt-1 text-[10px] font-semibold text-rose-700">{item.issue || 'No longer available'}</p>}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex h-10 items-center gap-3 rounded-full border border-[#e9e8e4] bg-[#fafaf9] px-2 shadow-sm">
                        <button onClick={() => changeQuantity(item, -step)} aria-label="Decrease quantity" className="grid h-8 w-8 place-items-center rounded-full text-[#34362f] hover:bg-[#f0efec]"><Minus size={16} /></button>
                        <span className="min-w-5 text-center text-sm font-semibold text-[#34362f]">{item.selectedQuantity}</span>
                        <button onClick={() => changeQuantity(item, step)} aria-label="Increase quantity" className="grid h-8 w-8 place-items-center rounded-full text-[#34362f] hover:bg-[#f0efec]"><Plus size={16} /></button>
                      </div>
                      <span className="text-base font-semibold text-[#292b26]">{unavailableItem ? 'Unavailable' : formatPrice(estimatedTotal(item))}</span>
                    </div>
                  </div>
                </article>
              })}
            </div>
          )}
        </div>
        {items.length > 0 && <div className="border-t border-[#eadfd7] bg-[#fffaf6] px-6 pb-6 pt-4 sm:px-8">
          <div className="flex justify-between text-sm text-[#77766f]"><span>Subtotal {isGuest && <span className="text-[10px]">(estimate)</span>}</span><span className="text-[22px] font-semibold tracking-[-.025em] text-[#292b26]">{formatPrice(total)}</span></div>
          <p className="mt-1 text-[10px] leading-4 text-[#99978f]">Final prices are confirmed with the store when your cart is refreshed.</p>
          {!isGuest && items.some((item) => item.needsSync) ? <button disabled={syncing} onClick={syncPendingItems} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#861923] text-base font-semibold text-white shadow-[0_8px_18px_-10px_rgba(90,13,24,.55)] hover:bg-[#70131c] disabled:opacity-60">{syncing ? 'Syncing saved items…' : 'Sync saved items'} <ArrowRight size={17} /></button> : !isGuest && unavailable ? <button disabled className="mt-4 flex h-14 w-full items-center justify-center rounded-[14px] bg-[#e3e1dc] text-base font-semibold text-[#77766f]">Resolve unavailable items</button> : isGuest ? <button onClick={onLogin} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#861923] text-base font-semibold text-white shadow-[0_8px_18px_-10px_rgba(90,13,24,.55)] hover:bg-[#70131c]">Sign in to checkout <ArrowRight size={17} /></button> : <Link to="/checkout" onClick={onClose} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-[#861923] text-base font-semibold text-white shadow-[0_8px_18px_-10px_rgba(90,13,24,.55)] hover:bg-[#70131c]">Proceed to checkout</Link>}
        </div>}
      </aside>
    </div>
  )
}
