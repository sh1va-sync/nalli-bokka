import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { MapPin, Search, Store, X } from 'lucide-react'
import { useGetCartQuery, useGetStoresQuery, useRemoveCartItemMutation } from '../../api/api.js'
import { clearGuestCart } from '../../cart/cartSlice.js'
import { setSelectedStore } from '../../store/storeSlice.js'
import CookingLoader from './CookingLoader.jsx'
import { capitalizeFirstLetter, getErrorMessage } from '../utils.js'

export default function StorePicker({ open, onClose }) {
  const dispatch = useDispatch()
  const token = useSelector((state) => state.auth.token)
  const guestItems = useSelector((state) => state.cart.guestItems)
  const selectedStore = useSelector((state) => state.selectedStore)
  const [search, setSearch] = useState('')
  const [switchingStoreId, setSwitchingStoreId] = useState('')
  const [switchError, setSwitchError] = useState('')
  const { data, error, isLoading, isFetching, refetch } = useGetStoresQuery({ limit: 100, search: search || undefined }, { skip: !open })
  const { data: cartResponse, error: cartError, isFetching: cartFetching, refetch: refetchCart } = useGetCartQuery(undefined, { skip: !open || !token })
  const [removeCartItem] = useRemoveCartItemMutation()
  if (!open) return null

  const stores = data?.data || []
  const cartItems = cartResponse?.data?.items || []
  const hasBasketItems = cartItems.length > 0 || guestItems.length > 0

  async function chooseStore(store) {
    if (store.isOpen === false || switchingStoreId || (token && (cartFetching || cartError))) return
    setSwitchError('')
    if (selectedStore?._id !== store._id && hasBasketItems) {
      const confirmed = window.confirm('Your basket belongs to the current store. Clear it and switch to this store?')
      if (!confirmed) return
      setSwitchingStoreId(store._id)
      try {
        for (const item of cartItems) await removeCartItem(item._id).unwrap()
        dispatch(clearGuestCart())
      } catch (removeError) {
        setSwitchError(`Could not clear your basket, so the store was not switched. Some items may already have been removed. ${getErrorMessage(removeError)}`)
        setSwitchingStoreId('')
        return
      }
      setSwitchingStoreId('')
    }
    dispatch(setSelectedStore(store))
    onClose()
  }

  return (
    <div className="customer-dialog-backdrop fixed inset-0 z-50 grid items-end bg-[var(--text-primary)]/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="store-title">
      <section className="customer-dialog-panel mx-auto max-h-[90vh] w-full max-w-lg overflow-hidden rounded-t-[24px] bg-[var(--bg-app)] shadow-2xl sm:rounded-[24px]">
        <div className="flex items-start justify-between border-b border-[var(--border-default)] px-6 py-5">
          <div><span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><Store size={18} strokeWidth={1.7} /></span><h2 id="store-title" className="font-display text-xl font-medium text-[var(--text-primary)]">Where should we deliver?</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Choose your neighbourhood store.</p></div>
          {selectedStore?.isOpen !== false && selectedStore && <button className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]" onClick={onClose} aria-label="Close store selection"><X size={19} /></button>}
        </div>
        <div className="p-5">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border-default)] bg-white px-3 text-[var(--text-secondary)]"><Search size={16} strokeWidth={1.7} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search area or store" className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]" /></label>
          {hasBasketItems && <p className="mt-3 rounded-xl bg-[#f2efe5] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">Switching stores clears your current basket. You’ll be asked to confirm before it is removed.</p>}
          {token && cartError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">Your basket couldn’t be checked. <button type="button" onClick={refetchCart} className="font-bold underline">Retry before switching</button> so no items are lost.</p>}
          {switchError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{switchError}</p>}
          <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto">
            {(isLoading || isFetching) && stores.length === 0 && <CookingLoader compact label="Finding nearby stores…" />}
            {error && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{getErrorMessage(error)} <button className="ml-2 font-bold underline" onClick={refetch}>Try again</button></div>}
            {stores.map((store) => {
              const storePhone = store.storePhone || store.storeNumber || '—'
              const mapsLink = store.googleMapsLink || store.googleMapLink || store.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.location || store.storeName)}`
              const storeName = capitalizeFirstLetter(store.storeName)
              const storeLocation = capitalizeFirstLetter(store.location)
              const isClosed = store.isOpen === false

              return (
                <article key={store._id} className={`rounded-[14px] border p-3.5 transition ${selectedStore?._id === store._id ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] shadow-[0_3px_12px_-10px_rgba(23,97,73,.45)]' : 'border-[var(--border-default)] bg-white hover:border-[#c8d9ce]'}`}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f0f3ed] text-[var(--brand-primary)]"><MapPin size={17} strokeWidth={1.7} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[var(--text-secondary)]">{storeName}</span><span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">{storeLocation}</span></span>
                    {selectedStore?._id === store._id && <span className="rounded-full bg-[#d7eadc] px-2.5 py-1 text-[10px] font-semibold text-[var(--brand-primary)]">Selected</span>}
                  </div>
                  <div className="ml-[52px] mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                    <span className={`rounded-full px-2 py-1 font-medium ${isClosed ? 'bg-[#f7eae8] text-[var(--status-danger)]' : 'bg-[var(--status-success-soft)] text-[var(--status-success)]'}`}>{isClosed ? 'Closed now' : 'Open now'}</span>
                    {storePhone !== '—' && <span className="rounded-full bg-[#f0f3ed] px-2 py-1">{storePhone}</span>}
                  </div>
                  {storePhone !== '—' && <p className="ml-[52px] mt-2 text-[10px] text-[var(--text-secondary)]">Call: {storePhone}</p>}
                  <div className="ml-[52px] mt-3 flex items-center gap-2">
                    <a href={mapsLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-lg border border-[#dce6dc] bg-white px-2.5 py-2 text-[10px] font-semibold text-[var(--text-secondary)] hover:border-[#b8d7c2] hover:bg-[#f4f8f3]">Get directions</a>
                  </div>
                  <button
                    disabled={isClosed || Boolean(switchingStoreId) || Boolean(token && (cartFetching || cartError))}
                    onClick={() => chooseStore(store)}
                    className="mt-3 h-10 w-full rounded-[8px] bg-[var(--brand-primary)] text-xs font-semibold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:bg-[#d5d0c7] disabled:text-[var(--text-secondary)]"
                  >
                    {switchingStoreId === store._id ? 'Clearing basket…' : isClosed ? 'Unavailable — choose an open store' : selectedStore?._id === store._id ? 'Continue with this store' : 'Choose this store'}
                  </button>
                </article>
              )
            })}
            {!isLoading && !error && stores.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No stores found. Try a different search.</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
