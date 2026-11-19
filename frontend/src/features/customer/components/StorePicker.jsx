import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { MapPin, RefreshCw, Search, Store, X } from 'lucide-react'
import { useClearCartMutation, useGetCartQuery, useGetStoresQuery } from '../../api/api.js'
import { clearGuestCart } from '../../cart/cartSlice.js'
import { setSelectedStore } from '../../store/storeSlice.js'
import CookingLoader from './CookingLoader.jsx'
import LanguageSwitcher from '../../i18n/LanguageSwitcher.jsx'
import { capitalizeFirstLetter, getErrorMessage } from '../utils.js'
import { useTranslation } from '../../i18n/LanguageContext.js'

export default function StorePicker({ open, onClose }) {
  const t = useTranslation()
  const dispatch = useDispatch()
  const token = useSelector((state) => state.auth.token)
  const guestItems = useSelector((state) => state.cart.guestItems)
  const selectedStore = useSelector((state) => state.selectedStore)
  const [search, setSearch] = useState('')
  const [switchingStoreId, setSwitchingStoreId] = useState('')
  const [switchError, setSwitchError] = useState('')
  const { data, error, isLoading, isFetching, refetch } = useGetStoresQuery({ limit: 100, search: search || undefined }, { skip: !open })
  const {
    data: directoryResponse,
    isLoading: directoryLoading,
    error: directoryError,
    isFetching: directoryFetching,
    refetch: refetchDirectory,
  } = useGetStoresQuery({ limit: 100 }, { skip: !open })
  const { data: cartResponse, error: cartError, isFetching: cartFetching, refetch: refetchCart } = useGetCartQuery(undefined, { skip: !open || !token })
  const [clearCart] = useClearCartMutation()
  if (!open) return null

  const stores = data?.data || []
  const cartItems = cartResponse?.data?.items || []
  const hasBasketItems = cartItems.length > 0 || guestItems.length > 0
  const noStoresAvailable = !directoryLoading
    && !directoryError
    && Array.isArray(directoryResponse?.data)
    && directoryResponse.data.length === 0

  async function chooseStore(store) {
    if (store.isOpen === false || switchingStoreId || (token && (cartFetching || cartError))) return
    setSwitchError('')
    if (selectedStore?._id !== store._id && hasBasketItems) {
      const confirmed = window.confirm(t('Your basket belongs to the current store. Clear it and switch to this store?'))
      if (!confirmed) return
      setSwitchingStoreId(store._id)
      try {
        if (token && cartItems.length) await clearCart().unwrap()
        dispatch(clearGuestCart())
      } catch (removeError) {
        setSwitchError(`${t('Could not clear your basket, so the store was not switched. Some items may already have been removed.')} ${getErrorMessage(removeError)}`)
        setSwitchingStoreId('')
        return
      }
      setSwitchingStoreId('')
    }
    dispatch(setSelectedStore(store))
    onClose()
  }

  if (noStoresAvailable) {
    return (
      <div className="customer-dialog-backdrop fixed inset-0 z-[60] grid place-items-center bg-[var(--bg-app)] px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="no-stores-title">
        <section className="relative w-full max-w-md rounded-[28px] border border-[var(--border-default)] bg-white px-6 py-10 text-center         shadow-[0_24px_70px_-35px_rgba(13,71,161,.28)] sm:px-10 sm:py-12">
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <LanguageSwitcher />
          </div>
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
            <Store size={29} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <h1 id="no-stores-title" className="mt-5 text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">{t('No stores available')}</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[var(--text-secondary)]">{t('There are no stores available right now. Please try again later.')}</p>
          <button type="button" onClick={refetchDirectory} disabled={directoryFetching} className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 text-sm font-bold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-wait disabled:opacity-60">
            <RefreshCw size={16} className={directoryFetching ? 'animate-spin' : ''} />{t(directoryFetching ? 'Checking stores…' : 'Try again')}
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="customer-dialog-backdrop fixed inset-0 z-50 grid items-end bg-[#172033]/55 p-0 backdrop-blur-md sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="store-title">
      <section className="customer-dialog-panel mx-auto max-h-[92vh] w-full max-w-[680px] overflow-hidden rounded-t-[28px] border border-white/70 bg-[var(--bg-app)] shadow-[0_24px_80px_-24px_rgba(23,32,51,.45)] sm:rounded-[28px]">
        <div className="flex items-start justify-between border-b border-[var(--border-default)] bg-white px-4 py-4 sm:px-7 sm:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-primary)] text-white sm:grid"><Store size={22} strokeWidth={1.8} /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--brand-primary)]">{t('ZepionMart stores')}</p>
              <h2 id="store-title" className="mt-1 max-w-[220px] text-lg font-extrabold leading-[1.15] tracking-[-0.03em] text-[var(--text-primary)] sm:max-w-none sm:text-2xl">{t('Where should we deliver?')}</h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">{t('Choose your neighbourhood store.')}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            {selectedStore?.isOpen !== false && selectedStore && <button className="grid h-10 w-10 place-items-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--bg-app)] hover:text-[var(--text-primary)]" onClick={onClose} aria-label={t('Close')}><X size={19} /></button>}
          </div>
        </div>
        <div className="p-4 sm:p-6">
          <label className="flex h-12 items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-white px-4 text-[var(--text-secondary)] shadow-[0_6px_20px_-18px_rgba(13,71,161,.35)] focus-within:border-[var(--brand-primary)] focus-within:ring-4 focus-within:ring-[var(--brand-primary)]/8"><Search size={18} strokeWidth={1.8} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search area or store')} className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]" /></label>
          {hasBasketItems && <p className="mt-3 rounded-xl border border-[var(--border-default)] bg-[var(--brand-primary-soft)] px-3 py-2.5 text-xs leading-5 text-[var(--text-primary)]">{t('Switching stores clears your current basket. You’ll be asked to confirm before it is removed.')}</p>}
          {token && cartError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{t('Your basket couldn’t be checked.')} <button type="button" onClick={refetchCart} className="font-bold underline">{t('Retry before switching')}</button> {t('so no items are lost.')}</p>}
          {switchError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{switchError}</p>}
          <div className="mt-4 grid max-h-[54vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {(isLoading || isFetching) && stores.length === 0 && <CookingLoader compact label={t('Finding nearby stores…')} />}
            {error && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{getErrorMessage(error)} <button className="ml-2 font-bold underline" onClick={refetch}>{t('Try again')}</button></div>}
            {stores.map((store) => {
              const storePhone = store.storePhone || store.storeNumber || '—'
              const mapsLink = store.googleMapsLink || store.googleMapLink || store.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.location || store.storeName)}`
              const storeName = capitalizeFirstLetter(store.storeName)
              const storeLocation = capitalizeFirstLetter(store.location)
              const isClosed = store.isOpen === false

              return (
                <article key={store._id} className={`flex min-h-[178px] flex-col rounded-[20px] border p-4 transition ${selectedStore?._id === store._id ? 'border-[var(--brand-primary)] bg-white shadow-[0_10px_28px_-18px_rgba(13,71,161,.40)]' : 'border-[var(--border-default)] bg-white hover:border-[var(--brand-primary)]/50 hover:shadow-[0_10px_28px_-20px_rgba(13,71,161,.28)]'}`}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><MapPin size={19} strokeWidth={1.8} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-[var(--text-primary)]">{storeName}</span><span className="mt-1 block truncate text-xs text-[var(--text-secondary)]">{storeLocation}</span></span>
                    {selectedStore?._id === store._id && <span className="rounded-full bg-[var(--status-success-soft)] px-2 py-1 text-[9px] font-bold text-[var(--status-success)]">{t('Selected')}</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                    <span className={`rounded-full px-2.5 py-1 font-bold ${isClosed ? 'bg-[var(--status-danger-soft)] text-[var(--status-danger)]' : 'bg-[var(--status-success-soft)] text-[var(--status-success)]'}`}>{t(isClosed ? 'Closed now' : 'Open now')}</span>
                    {storePhone !== '—' && <span className="rounded-full bg-[var(--bg-app)] px-2.5 py-1 font-semibold">{storePhone}</span>}
                  </div>
                  <div className="mt-auto pt-4">
                    <a href={mapsLink} target="_blank" rel="noreferrer" className="mb-2 inline-flex h-9 w-full items-center justify-center rounded-xl border border-[var(--border-default)] bg-white text-[11px] font-bold text-[var(--brand-primary)] transition hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)]">{t('Get directions')}</a>
                  <button
                    disabled={isClosed || Boolean(switchingStoreId) || Boolean(token && (cartFetching || cartError))}
                    onClick={() => chooseStore(store)}
                    className="button-strong h-10 w-full rounded-xl text-xs font-bold transition disabled:cursor-not-allowed disabled:bg-[var(--border-default)] disabled:text-[var(--text-secondary)]"
                  >
                    {t(switchingStoreId === store._id ? 'Clearing basket…' : isClosed ? 'Unavailable — choose an open store' : selectedStore?._id === store._id ? 'Continue with this store' : 'Choose this store')}
                  </button>
                  </div>
                </article>
              )
            })}
            {!isLoading && !error && stores.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{t('No stores found. Try a different search.')}</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
