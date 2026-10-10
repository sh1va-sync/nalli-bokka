import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { MapPin, Search, Store, X } from 'lucide-react'
import { useGetCartQuery, useGetStoresQuery } from '../../api/api.js'
import { setSelectedStore } from '../../store/storeSlice.js'
import { getErrorMessage } from '../utils.js'

export default function StorePicker({ open, onClose }) {
  const dispatch = useDispatch()
  const token = useSelector((state) => state.auth.token)
  const guestItems = useSelector((state) => state.cart.guestItems)
  const selectedStore = useSelector((state) => state.selectedStore)
  const [search, setSearch] = useState('')
  const { data, error, isLoading, isFetching, refetch } = useGetStoresQuery({ limit: 100, search: search || undefined }, { skip: !open })
  const { data: cartResponse, isFetching: cartFetching } = useGetCartQuery(undefined, { skip: !open || !token })
  if (!open) return null

  const stores = data?.data || []
  const hasBasketItems = token ? cartFetching || Boolean(cartResponse?.data?.items?.length) : guestItems.length > 0
  return (
    <div className="fixed inset-0 z-50 grid items-end bg-[#24251f]/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="store-title">
      <section className="mx-auto max-h-[90vh] w-full max-w-lg overflow-hidden rounded-t-[24px] bg-[#fbf7f1] shadow-2xl sm:rounded-[24px]">
        <div className="flex items-start justify-between border-b border-[#eadfd7] px-6 py-5">
          <div><span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f3e2dc] text-[#861923]"><Store size={18} strokeWidth={1.7} /></span><h2 id="store-title" className="font-display text-xl font-medium text-[#392824]">Where should we deliver?</h2><p className="mt-1 text-sm text-[#82736d]">Choose your neighbourhood store.</p></div>
          {selectedStore && <button className="rounded-full p-2 text-[#797b70] hover:bg-[#eeede6]" onClick={onClose} aria-label="Close store selection"><X size={19} /></button>}
        </div>
        <div className="p-5">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-[#e5e2d9] bg-white px-3 text-[#8a8a7e]"><Search size={16} strokeWidth={1.7} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search area or store" className="w-full bg-transparent text-sm text-[#30332b] outline-none placeholder:text-[#a3a297]" /></label>
          {hasBasketItems && <p className="mt-3 rounded-xl bg-[#f2efe5] px-3 py-2 text-xs leading-5 text-[#71674f]">Empty your basket before switching stores; baskets belong to a single store at a time.</p>}
          <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto">
            {(isLoading || isFetching) && stores.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Finding nearby stores…</p>}
            {error && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{getErrorMessage(error)} <button className="ml-2 font-bold underline" onClick={refetch}>Try again</button></div>}
            {stores.map((store) => (
              <article key={store._id} className={`rounded-[14px] border p-3.5 transition ${selectedStore?._id === store._id ? 'border-[#d9aaa0] bg-[#fbf3ef]' : 'border-[#eadfd7] bg-white hover:border-[#d5b7aa]'}`}>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f7eee8] text-[#9b5148]"><MapPin size={17} strokeWidth={1.7} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#373a32]">{store.storeName}</span><span className="mt-0.5 block truncate text-xs text-[#85867b]">{store.location}</span></span>
                  {selectedStore?._id === store._id && <span className="rounded-full bg-[#f2e0dc] px-2.5 py-1 text-[10px] font-medium text-[#861923]">Selected</span>}
                </div>
                <p className="ml-[52px] mt-2 text-[10px] text-[#96968b]">NalliBokka neighbourhood store</p>
                <button
                  disabled={Boolean(selectedStore && hasBasketItems && selectedStore._id !== store._id)}
                  onClick={() => { dispatch(setSelectedStore(store)); onClose() }}
                  className="mt-3 h-10 w-full rounded-[8px] bg-[#861923] text-xs font-semibold text-white transition hover:bg-[#70131c] disabled:cursor-not-allowed disabled:bg-[#d5d0c7] disabled:text-[#77766f]"
                >
                  {selectedStore?._id === store._id ? 'Continue with this store' : selectedStore && hasBasketItems ? 'Empty basket before switching' : 'Choose this store'}
                </button>
              </article>
            ))}
            {!isLoading && !error && stores.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No stores found. Try a different search.</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
