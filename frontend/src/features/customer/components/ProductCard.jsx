import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Minus, Plus, Trash2, X } from 'lucide-react'
import { addGuestItem } from '../../cart/cartSlice.js'
import { useAddCartItemMutation } from '../../api/api.js'
import { formatPrice, getErrorMessage } from '../utils.js'

const categoryEmoji = { meat: '🍗', vegetable: '🥬', fruit: '🍊', oil: '🫒', rice: '🌾' }
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
  return <article className="quantity-option rounded-[12px] border border-[var(--border-default)] bg-white p-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-[var(--text-primary)]">{option.label}</p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{formatPrice(option.price)}</p>
    </div>
    {count === 0
      ?       <button onClick={() => setCount(1)} className="mt-2.5 h-10 w-full rounded-[8px] bg-[var(--brand-primary)] text-[13px] font-semibold transition hover:bg-[var(--brand-primary-hover)]">Add</button>
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
  const store = typeof product.storeId === 'object' ? product.storeId : null
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
      <article className="product-card group overflow-hidden rounded-[16px] border border-[var(--border-default)] bg-white p-1.5 shadow-[0_2px_8px_-6px_rgba(48,49,39,.28)] transition hover:border-[var(--brand-secondary)] hover:shadow-[0_10px_28px_-19px_rgba(48,49,39,.36)] sm:rounded-[18px] sm:p-2">
        <div className="relative aspect-[1.08/1] overflow-hidden rounded-t-[12px] bg-[#f0efe8] sm:rounded-t-[14px]">
          {product.imageUrl && !imageFailed
            ? <img src={product.imageUrl} alt={product.productName} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" onError={() => setImageFailed(true)} />
            : <div className="grid h-full place-items-center text-6xl" aria-hidden="true">{categoryEmoji[product.productType] || '🛍️'}</div>}
          {!product.inStock && <span className="absolute inset-x-2 bottom-2 rounded-md bg-white/90 px-2 py-1 text-center text-[10px] font-semibold text-[var(--text-secondary)]">Currently unavailable</span>}
        </div>
        <div className="px-2 pb-2 pt-2.5 sm:px-2.5 sm:pb-2.5">
          <h3 className="line-clamp-2 min-h-10 text-[13px] font-semibold leading-5 text-[var(--text-primary)] sm:text-sm">{product.productName}</h3>
          <span className="mt-1 inline-flex rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[9px] font-semibold capitalize text-[var(--brand-primary)]">{product.productType}</span>
          <p className="mt-0.5 text-sm font-semibold tracking-[-.02em] text-[var(--text-primary)]">{getPriceRange(product)}</p>
          <p className="mt-0.5 min-h-4 text-[10px] text-[var(--text-secondary)]">{product.packs?.length ? 'Prices vary by pack' : 'Prices vary by quantity'}</p>
          {store?.storeName && <p className="mt-1 truncate text-[10px] text-[var(--text-secondary)]">{store.storeName}</p>}
          <button
            onClick={() => { setCounts({}); setError(''); setOptionsOpen(true) }}
            disabled={isLoading || product.inStock === false}
            className="button-strong mt-3 flex h-10 w-full items-center justify-center rounded-[9px] bg-[var(--brand-primary)] text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 sm:h-11"
          >
            Choose
          </button>
        </div>
      </article>

      {optionsOpen && <div className="fixed inset-0 z-50 grid items-end bg-[var(--text-primary)]/40 backdrop-blur-[3px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOptionsOpen(false) }}>
        <section role="dialog" aria-modal="true" aria-labelledby={`product-options-${product._id}`} className="product-quantity-dialog mx-auto flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:rounded-[22px]">
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
            <button disabled={isLoading} onClick={addSelection} className="h-11 w-full rounded-[9px] bg-[var(--brand-primary)] text-sm font-semibold transition disabled:opacity-60">{isLoading ? 'Adding…' : 'Done'}</button>
          </div>
        </section>
      </div>}
    </>
  )
}
