import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Minus, Plus, Trash2, X } from 'lucide-react'
import { addGuestItem } from '../../cart/cartSlice.js'
import { useAddCartItemMutation } from '../../api/api.js'
import { formatPrice, getErrorMessage } from '../utils.js'
import { getCategoryPhoto } from './categoryAssets.js'

const weightOptions = [
  { label: '1 kg', quantity: 1 },
  { label: '750 grams', quantity: 0.75 },
  { label: '500 grams', quantity: 0.5 },
  { label: '250 grams', quantity: 0.25 },
]

function optionKey(option) {
  return `${option.selectionType}-${option.packLabel || option.quantity}`
}

function getPriceRange(product) {
  if (product.packs?.length) {
    const prices = product.packs.map((pack) => Number(pack.price)).filter(Number.isFinite)
    return prices.length ? `${formatPrice(Math.min(...prices))} – ${formatPrice(Math.max(...prices))}` : 'View pack prices'
  }
  const pricePerKg = Number(product.pricePerKg)
  return Number.isFinite(pricePerKg)
    ? `${formatPrice(pricePerKg * 0.25)} – ${formatPrice(pricePerKg)}`
    : 'Price unavailable'
}

function getSelectionOptions(product) {
  if (product.packs?.length) {
    return product.packs.map((pack) => ({
      selectionType: 'pack',
      quantity: 1,
      packLabel: pack.label,
      label: pack.label,
      price: Number(pack.price),
    }))
  }
  const options = weightOptions.map((option) => ({
    ...option,
    selectionType: 'weight',
    price: Number(product.pricePerKg) * option.quantity,
  }))
  return options
}

function SelectionOption({ option, count, setCount }) {
  return <article className="quantity-option rounded-[14px] border border-[var(--border-default)] bg-white p-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-[var(--text-primary)]">{option.label}</p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{formatPrice(option.price)}</p>
    </div>
    {count === 0
      ?       <button onClick={() => setCount(1)} className="button-strong quantity-add-button mt-2.5 h-11 w-full rounded-xl text-sm font-bold shadow-sm transition hover:-translate-y-px hover:shadow-md">Add</button>
      : <div className="mt-2.5 flex h-11 items-center justify-around rounded-full border border-[var(--border-default)] bg-[var(--bg-app)] shadow-sm">
        <button onClick={() => setCount(Math.max(0, count - 1))} aria-label={`Remove one ${option.label}`} className="grid h-9 w-12 place-items-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]">{count === 1 ? <Trash2 size={17} /> : <Minus size={17} />}</button>
        <span className="min-w-8 text-center text-sm font-semibold text-[var(--text-primary)]">{count}</span>
        <button onClick={() => setCount(count + 1)} aria-label={`Add one ${option.label}`} className="grid h-9 w-12 place-items-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"><Plus size={17} /></button>
      </div>}
  </article>
}

export default function ProductCard({ product }) {
  const dispatch = useDispatch()
  const token = useSelector((state) => state.auth.token)
  const [addItem, { isLoading }] = useAddCartItemMutation()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [counts, setCounts] = useState({})
  const [error, setError] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const options = getSelectionOptions(product)
  const selectedOptions = options
    .map((option) => ({ ...option, count: counts[optionKey(option)] || 0 }))
    .filter((option) => option.count > 0)
  const itemCount = selectedOptions.reduce((total, option) => total + option.count, 0)
  const subtotal = selectedOptions.reduce((total, option) => total + option.price * option.count, 0)

  async function addSelection() {
    if (!selectedOptions.length) {
      setOptionsOpen(false)
      return
    }
    setError('')
    const guestItem = {
      key: `${product._id}-${selectedOptions[0].selectionType}-${selectedOptions[0].packLabel || ''}`,
      product,
    }
    if (!token) {
      if (selectedOptions[0].selectionType === 'weight') {
        dispatch(addGuestItem({
          ...guestItem,
          selectionType: 'weight',
          selectedQuantity: selectedOptions.reduce((total, option) => total + option.quantity * option.count, 0),
        }))
      } else {
        selectedOptions.forEach((option) => dispatch(addGuestItem({
          ...guestItem,
          key: `${product._id}-pack-${option.packLabel}`,
          selectionType: 'pack',
          selectedQuantity: option.count,
          selectedPackLabel: option.packLabel,
        })))
      }
      setCounts({})
      setOptionsOpen(false)
      return
    }
    try {
      if (selectedOptions[0].selectionType === 'weight') {
        await addItem({
          productId: product._id,
          selectionType: 'weight',
          selectedQuantity: selectedOptions.reduce((total, option) => total + option.quantity * option.count, 0),
        }).unwrap()
      } else {
        for (const option of selectedOptions) {
          await addItem({
            productId: product._id,
            selectionType: 'pack',
            selectedQuantity: option.count,
            selectedPackLabel: option.packLabel,
          }).unwrap()
        }
      }
      setCounts({})
      setOptionsOpen(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  function setOptionCount(option, count) {
    setCounts((current) => ({ ...current, [optionKey(option)]: count }))
  }

  return (
    <>
      <article className="product-card group flex h-full flex-col overflow-hidden rounded-[20px] border border-[var(--border-default)] bg-white p-0 shadow-[0_5px_18px_-14px_rgba(23,55,39,.34)] transition-[transform,box-shadow,border-color] duration-300 sm:rounded-[23px]">
        <div className="product-card-media relative aspect-[1.08/1] overflow-hidden bg-[#f0efe8]">
          {product.imageUrl && !imageFailed
            ? <img src={product.imageUrl} alt={product.productName} loading="lazy" className="product-card-image h-full w-full object-cover" onError={() => setImageFailed(true)} />
            : <img src={getCategoryPhoto(product.productType)} alt="" loading="lazy" className="product-card-image h-full w-full object-cover" />}
          <span className="product-card-image-shade pointer-events-none absolute inset-0" aria-hidden="true" />
          {!product.inStock && <span className="absolute inset-x-2 bottom-2 rounded-lg bg-white/95 px-2 py-1.5 text-center text-[10px] font-semibold text-[var(--text-secondary)] shadow-sm">Currently unavailable</span>}
        </div>
        <div className="product-card-body px-2 pb-2 pt-2 sm:px-2.5 sm:pb-2.5">
          <h3 className="line-clamp-2 text-[13px] font-bold leading-[1.35] tracking-[-.015em] text-[var(--text-primary)] sm:text-sm">{product.productName}</h3>
          <p className="mt-1 text-[14px] font-bold tracking-[-.025em] text-[var(--brand-primary)] sm:text-[15px]">{getPriceRange(product)}</p>
          <p className="mt-0.5 text-[9px] leading-3 text-[var(--text-secondary)]">{product.packs?.length ? 'Price varies by pack' : 'Price varies by quantity'}</p>
          <button
            onClick={() => { setCounts({}); setError(''); setOptionsOpen(true) }}
            disabled={isLoading || product.inStock === false}
            className="button-strong product-card-choose mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45 sm:h-11 sm:text-[13px]"
          >
            <Plus size={15} strokeWidth={2.5} /> Choose
          </button>
        </div>
      </article>

      {optionsOpen && <div className="product-dialog-backdrop fixed inset-0 z-50 grid items-end bg-[var(--text-primary)]/45 backdrop-blur-[3px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOptionsOpen(false) }}>
        <section role="dialog" aria-modal="true" aria-labelledby={`product-options-${product._id}`} className="product-quantity-dialog mx-auto flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-[26px] bg-white shadow-2xl sm:rounded-[24px]">
          <div className="flex items-start justify-between border-b border-[var(--surface-subtle)] px-5 py-4">
            <div className="min-w-0">
              <h2 id={`product-options-${product._id}`} className="truncate text-[17px] font-semibold tracking-[-.025em] text-[var(--text-primary)]">{product.productName}</h2>
              <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">{getPriceRange(product)}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--text-secondary)]">Choose quantity</p>
            </div>
            <button onClick={() => setOptionsOpen(false)} aria-label="Close quantity selection" className="ml-3 rounded-full p-1.5 text-[var(--text-secondary)] hover:bg-[#f2f1ed]"><X size={18} /></button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-[#faf9f7] px-4 py-3">
            {options.map((option) => <SelectionOption
              key={optionKey(option)}
              option={option}
              count={counts[optionKey(option)] || 0}
              setCount={(count) => setOptionCount(option, count)}
            />)}
            {error && <p role="alert" className="rounded-lg bg-[var(--status-danger-soft)] p-3 text-xs text-[var(--status-danger)]">{error}</p>}
          </div>
          <div className="border-t border-[var(--surface-subtle)] bg-white px-4 pb-4 pt-3">
            <p className="mb-3 text-center text-sm text-[var(--text-secondary)]">{itemCount} {itemCount === 1 ? 'item' : 'items'} · {formatPrice(subtotal)}</p>
            <button disabled={isLoading} onClick={addSelection} className="button-strong h-12 w-full rounded-xl text-sm font-bold shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:opacity-60">{isLoading ? 'Adding…' : 'Done'}</button>
          </div>
        </section>
      </div>}
    </>
  )
}
