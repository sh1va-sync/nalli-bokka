import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, Boxes, CalendarDays, Check, ChevronLeft,
  ChevronRight, ClipboardList, Clock3, CreditCard, LayoutDashboard, LogOut, PackagePlus,
  Download, FileText, Power, RefreshCw, RotateCcw, Search, Trash2, Truck, X,
} from 'lucide-react'
import {
  useCreateStoreProductMutation, useDeleteStoreProductMutation, useExportStoreReportMutation,
  useGetStoreDashboardQuery,
  useGetStoreMeQuery, useGetStoreOrdersQuery, useGetStoreProductsQuery, useGetStoreProductCategoriesQuery,
  useCreateStoreProductCategoryMutation, useDeleteStoreProductCategoryMutation,
  useGetStoreAuditEventsQuery, useGetStoreTransactionsQuery, useSetStoreProductStockMutation, useToggleStoreStatusMutation,
  useUpdateStoreHoursMutation,
  useDownloadStoreOrderInvoiceMutation, useUpdateStoreOrderStatusMutation,
  useRefundStoreOrderMutation, useUpdateStoreProductMutation,
} from '../../api/api.js'
import { api } from '../../api/api.js'
import { getErrorMessage, formatItemQuantity, formatPrice, saveInvoicePdf } from '../../customer/utils.js'
import StoreLoader from '../components/StoreLoader.jsx'
import { storeSignedOut } from '../storeAuthSlice.js'
import LanguageSwitcher from '../../i18n/LanguageSwitcher.jsx'
import { useTranslation } from '../../i18n/LanguageContext.js'

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'transactions', label: 'Transactions', icon: CreditCard },
  { id: 'activity', label: 'Activity log', icon: Activity },
  { id: 'reports', label: 'Reports', icon: Download },
]
const productTypes = ['meat', 'vegetable', 'fruit', 'oil', 'rice']
const getDefaultPricingMode = (productType, packs = []) => (
  productType === 'oil' || (productType === 'rice' && packs.length) ? 'pack' : 'weight'
)
const formatCategoryLabel = (name) => name.split(/\s+/).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ')
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const getLocalDayRange = (dateString) => {
  const from = new Date(`${dateString}T00:00:00`)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from: from.toISOString(), to: to.toISOString() }
}
const getData = (response) => response?.data || []

function DateFilter({ selectedDate, today, onChange }) {
  const t = useTranslation()
  function shiftDate(amount) {
    const next = new Date(`${selectedDate}T12:00:00`)
    next.setDate(next.getDate() + amount)
    onChange(getLocalDateString(next))
  }

  const dateLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return <section className="store-dashboard-filter dashboard-enter mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-default)] bg-white p-4 sm:p-5">
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4f3ef] text-[var(--text-secondary)]"><CalendarDays size={18} /></span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--text-tertiary)]">{t(selectedDate === today ? "Today's activity" : 'Daily report')}</p>
        <p className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{dateLabel}</p>
      </div>
    </div>
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <button type="button" onClick={() => shiftDate(-1)} aria-label={t('View previous day')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] transition hover:bg-[#f7f6f2]"><ChevronLeft size={17} /></button>
      <label className="relative flex h-10 min-w-0 flex-1 items-center rounded-xl border border-[var(--border-default)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] transition focus-within:border-[#aaa69d] sm:w-44 sm:flex-none">
        <CalendarDays className="mr-2 shrink-0 text-[var(--text-tertiary)]" size={15} />
        <input aria-label={t('Select dashboard date')} type="date" value={selectedDate} max={today} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none" />
      </label>
      <button type="button" onClick={() => shiftDate(1)} disabled={selectedDate >= today} aria-label={t('View next day')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] transition hover:bg-[#f7f6f2] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={17} /></button>
      {selectedDate !== today && <button type="button" onClick={() => onChange(today)} className="h-10 shrink-0 rounded-xl bg-[var(--text-primary)] px-3 text-xs font-semibold text-white transition hover:bg-[#49423e]">{t('Today')}</button>}
    </div>
  </section>
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'wine' }) {
  const t = useTranslation()
  const colors = tone === 'green'
    ? 'bg-[var(--status-success-soft)] text-[var(--status-success)]'
    : tone === 'coral'
      ? 'bg-[var(--status-danger-soft)] text-[var(--status-danger)]'
      : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]'
  return <article className="store-dashboard-metric rounded-2xl border border-[var(--border-default)] bg-white p-4 transition duration-200 hover:border-[#d3d0c9] sm:p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-[var(--text-secondary)]">{t(label)}</p><p className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[var(--text-primary)]">{value}</p><p className="mt-1 text-[11px] text-[var(--text-secondary)]">{t(detail)}</p></div><span className={`grid h-9 w-9 place-items-center rounded-xl ${colors}`}><Icon size={17} /></span></div>
  </article>
}

function SectionTitle({ eyebrow, title, children }) {
  const t = useTranslation()
  return <div className="store-dashboard-heading mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--text-tertiary)]">{t(eyebrow)}</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.035em] text-[var(--text-primary)] sm:text-[28px]">{t(title)}</h1></div>{children}</div>
}

function PaginationControls({ pagination, page, onPageChange }) {
  const t = useTranslation()
  if (!pagination || pagination.pages <= 1) return null
  const outOfRange = page > pagination.pages
  const previousPage = outOfRange ? Math.max(1, pagination.pages) : page - 1
  return <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
    <span>{t('Page')} {page} {t('of')} {pagination.pages} · {pagination.total} {t('total')}</span>
    <div className="flex gap-2">
      <button disabled={page <= 1} onClick={() => onPageChange(previousPage)} className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 font-semibold disabled:opacity-45">{t(outOfRange ? 'Return to last page' : 'Previous')}</button>
      <button disabled={outOfRange || page >= pagination.pages} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 font-semibold disabled:opacity-45">{t('Next')}</button>
    </div>
  </div>
}

function ProductForm({ product, categories = [], onCancel, onSaved }) {
  const t = useTranslation()
  const [createProduct, createState] = useCreateStoreProductMutation()
  const [updateProduct, updateState] = useUpdateStoreProductMutation()
  const [createCategory, createCategoryState] = useCreateStoreProductCategoryMutation()
  const [deleteCategory, deleteCategoryState] = useDeleteStoreProductCategoryMutation()
  const [form, setForm] = useState(() => ({
    productType: product?.productType || 'meat',
    pricingMode: product?.pricingMode || getDefaultPricingMode(product?.productType || 'meat', product?.packs),
    productName: product?.productName || '',
    pricePerKg: product?.pricePerKg ?? '',
    packs: product?.packs?.length ? product.packs.map(({ label, price }) => ({ label, price })) : [{ label: '', price: '' }],
  }))
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(product?.imageUrl || '')
  const [error, setError] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [categoryImageFile, setCategoryImageFile] = useState(null)
  const [categoryImagePreview, setCategoryImagePreview] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [showCategoryInput, setShowCategoryInput] = useState(false)
  const packPricing = form.pricingMode === 'pack'
  const isSaving = createState.isLoading || updateState.isLoading

  useEffect(() => {
    return () => {
      if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  useEffect(() => {
    return () => {
      if (categoryImagePreview.startsWith('blob:')) URL.revokeObjectURL(categoryImagePreview)
    }
  }, [categoryImagePreview])

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!product && !imageFile) {
      setError('Choose a product image file.')
      return
    }
    const body = {
      productType: form.productType.toLowerCase(),
      pricingMode: form.pricingMode,
      productName: form.productName.trim(),
    }
    if (packPricing) body.packs = form.packs.map(({ label, price }) => ({ label: label.trim(), price: Number(price) }))
    else body.pricePerKg = Number(form.pricePerKg)
    const formData = new FormData()
    formData.append('productData', JSON.stringify(body))
    if (imageFile) formData.append('image', imageFile)
    try {
      let response
      if (product) {
        body.inStock = product.inStock
        if (product.packs?.length && !packPricing) body.packs = []
        if (!product.packs?.length && packPricing) body.pricePerKg = null
        formData.set('productData', JSON.stringify(body))
        response = await updateProduct({ productId: product._id, body: formData }).unwrap()
      } else {
        body.inStock = true
        formData.set('productData', JSON.stringify(body))
        response = await createProduct(formData).unwrap()
      }
      onSaved(response.warnings)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  function changeType(productType) {
    setForm((current) => ({
      ...current,
      productType,
      pricingMode: getDefaultPricingMode(productType),
    }))
  }

  async function saveCategory() {
    setCategoryError('')
    if (!categoryImageFile) {
      setCategoryError('Choose an image for this category.')
      return
    }
    const body = new FormData()
    body.append('name', categoryName.trim())
    body.append('image', categoryImageFile)
    try {
      const response = await createCategory(body).unwrap()
      setForm((current) => ({ ...current, productType: response.data.name, pricingMode: 'weight' }))
      setCategoryName('')
      setCategoryImageFile(null)
      setCategoryImagePreview('')
      setShowCategoryInput(false)
    } catch (requestError) {
      setCategoryError(getErrorMessage(requestError))
    }
  }

  async function removeCategory(name) {
    if (!window.confirm(`${t('Delete')} "${t(formatCategoryLabel(name))}"? ${t('Categories with products cannot be deleted.')}`)) return
    setCategoryError('')
    try {
      await deleteCategory(name).unwrap()
      if (form.productType === name) changeType(productTypes[0])
    } catch (requestError) {
      setCategoryError(getErrorMessage(requestError))
    }
  }

  return <form onSubmit={submit} className="mt-4 rounded-[18px] border border-[var(--border-default)] bg-[var(--bg-app)] p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">    <div><h3 className="text-sm font-semibold text-[var(--text-primary)]">{product ? `${t('Edit')} ${t(product.productName)}` : t('Add product to inventory')}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{t('Add a category for your store, then choose pricing for each product.')}</p></div><button type="button" onClick={onCancel} className="text-xs font-semibold text-[var(--brand-primary)]">{t('Cancel')}</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="text-xs font-semibold text-[var(--text-secondary)]">{t('CATEGORY')}
          <select disabled={Boolean(product)} value={form.productType} onChange={(event) => changeType(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)] disabled:bg-[#f7f3ef]">{categories.map((type) => <option key={type} value={type}>{t(formatCategoryLabel(type))}</option>)}</select>
        </label>
        {!product && (showCategoryInput
          ? <div className="mt-2">
            <div className="space-y-2">
              <input autoFocus maxLength={40} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (categoryName.trim() && categoryImageFile) saveCategory() } }} aria-label={t('New category name')} placeholder={t('New category name')} className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-xs outline-none focus:border-[var(--brand-primary)]" />
              <label className="block rounded-lg border border-dashed border-[var(--border-default)] bg-white p-2 text-[10px] font-semibold text-[var(--text-secondary)]">
                {t('CATEGORY IMAGE (JPEG, PNG, or WebP · max 5 MB)')}
                <input required type="file" accept="image/jpeg,image/png,image/webp" aria-label={t('Category image')} onChange={(event) => {
                  const file = event.target.files?.[0]
                  setCategoryError('')
                  if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                    setCategoryError('Choose a JPEG, PNG, or WebP image.')
                    event.target.value = ''
                    return
                  }
                  if (file && file.size > 5 * 1024 * 1024) {
                    setCategoryError('Category images must be 5 MB or smaller.')
                    event.target.value = ''
                    return
                  }
                  setCategoryImageFile(file || null)
                  setCategoryImagePreview(file ? URL.createObjectURL(file) : '')
                }} className="mt-1.5 block w-full text-[10px] font-normal" />
              </label>
              {categoryImagePreview && <img src={categoryImagePreview} alt={t('Category preview')} className="h-16 w-16 rounded-lg object-cover" />}
              <div className="flex justify-end gap-2">
                <button type="button" disabled={!categoryName.trim() || !categoryImageFile || createCategoryState.isLoading} onClick={saveCategory} className="rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{createCategoryState.isLoading ? t('Saving…') : t('Save')}</button>
                <button type="button" onClick={() => { setShowCategoryInput(false); setCategoryName(''); setCategoryImageFile(null); setCategoryImagePreview(''); setCategoryError('') }} className="rounded-lg px-2 text-xs font-semibold text-[var(--brand-primary)]">{t('Cancel')}</button>
              </div>
            </div>
            {categoryError && <p role="alert" className="mt-2 text-xs text-rose-700">{categoryError}</p>}
          </div>
          : <button type="button" onClick={() => setShowCategoryInput(true)} className="mt-2 text-xs font-semibold text-[var(--brand-primary)]">+ {t('Add category')}</button>)}
        {!product && categories.length > 0 && <details className="mt-3 rounded-lg border border-[var(--border-default)] bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">{t('Manage categories')} ({categories.length})</summary>
          <ul className="divide-y divide-[var(--border-default)] px-3">
            {categories.map((name) => <li key={name} className="flex items-center justify-between gap-3 py-2">
              <span className="text-xs text-[var(--text-primary)]">{t(formatCategoryLabel(name))}</span>
              <button type="button" disabled={deleteCategoryState.isLoading} onClick={() => removeCategory(name)} aria-label={`${t('Delete')} ${t(formatCategoryLabel(name))} ${t('category')}`} className="rounded-md p-1.5 text-[var(--status-danger)] transition hover:bg-[var(--status-danger-soft)] disabled:opacity-50"><Trash2 size={14} /></button>
            </li>)}
          </ul>
        </details>}
        {categoryError && !showCategoryInput && <p role="alert" className="mt-2 text-xs text-rose-700">{categoryError}</p>}
      </div>
      <label className="text-xs font-semibold text-[var(--text-secondary)]">{t('PRODUCT NAME')}
        <input required maxLength={120} value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" placeholder={t('Product name')} />
      </label>
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-[var(--text-secondary)]">PRODUCT IMAGE
          <input required={!product} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            const file = event.target.files?.[0]
            setError('')
            if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
              setError('Choose a JPEG, PNG, or WebP image.')
              event.target.value = ''
              setImageFile(null)
              setImagePreview(product?.imageUrl || '')
              return
            }
            if (file && file.size > 5 * 1024 * 1024) {
              setError('Product image must be 5 MB or smaller.')
              event.target.value = ''
              setImageFile(null)
              setImagePreview(product?.imageUrl || '')
              return
            }
            setImageFile(file || null)
            setImagePreview(file ? URL.createObjectURL(file) : product?.imageUrl || '')
          }} className="mt-1.5 block w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm font-normal text-[var(--text-primary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--brand-primary-soft)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--brand-primary)]" />
        </label>
        <p className="mt-1 text-[10px] text-[var(--text-secondary)]">{t('JPEG, PNG, or WebP · up to 5 MB')}{product ? ` · ${t('leave empty to keep the current image')}` : ''}</p>
        {imagePreview && <img src={imagePreview} alt="Product image preview" className="mt-3 h-24 w-24 rounded-xl border border-[var(--border-default)] bg-white object-cover" />}
      </div>
      <label className="text-xs font-semibold text-[var(--text-secondary)]">{t('PRICING FOR THIS PRODUCT')}
        <select value={form.pricingMode} onChange={(event) => setForm({ ...form, pricingMode: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"><option value="weight">{t('Per kilogram')}</option><option value="pack">{t('Fixed-price packs')}</option></select>
      </label>
      {packPricing ? <div className="sm:col-span-2">
        <div className="flex items-center justify-between"><p className="text-xs font-semibold text-[var(--text-secondary)]">{t('PACKS & PRICES')}</p><button type="button" onClick={() => setForm({ ...form, packs: [...form.packs, { label: '', price: '' }] })} className="text-xs font-semibold text-[var(--brand-primary)]">+ {t('Add pack')}</button></div>
        <div className="mt-2 space-y-2">{form.packs.map((pack, index) => <div key={index} className="grid grid-cols-[1fr_120px_34px] gap-2">
          <input required maxLength={40} aria-label={`${t('Pack')} ${index + 1} ${t('label')}`} value={pack.label} onChange={(event) => setForm({ ...form, packs: form.packs.map((current, i) => i === index ? { ...current, label: event.target.value } : current) })} className="h-10 min-w-0 rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--brand-primary)]" placeholder={t('e.g. 1 L')} />
          <input required type="number" min="0" step="0.01" aria-label={`${t('Pack')} ${index + 1} ${t('price')}`} value={pack.price} onChange={(event) => setForm({ ...form, packs: form.packs.map((current, i) => i === index ? { ...current, price: event.target.value } : current) })} className="h-10 min-w-0 rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--brand-primary)]" placeholder={t('Price ₹')} />
          <button type="button" disabled={form.packs.length === 1} onClick={() => setForm({ ...form, packs: form.packs.filter((_, i) => i !== index) })} aria-label={`${t('Remove pack')} ${index + 1}`} className="grid h-10 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--status-danger-soft)] disabled:opacity-35"><Trash2 size={15} /></button>
        </div>)}</div>
      </div> : <label className="text-xs font-semibold text-[var(--text-secondary)]">{t('PRICE PER KG (₹)')}
        <input required type="number" min="0" step="0.01" value={form.pricePerKg} onChange={(event) => setForm({ ...form, pricePerKg: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" placeholder="0.00" />
      </label>}
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-[var(--status-danger-soft)] p-3 text-xs text-[var(--status-danger)]">{t(error)}</p>}
    <div className="mt-4 flex justify-end"><button disabled={isSaving} className="h-10 rounded-lg bg-[var(--brand-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-55">{isSaving ? t('Saving…') : product ? t('Save changes') : t('Save product')}</button></div>
  </form>
}

export default function StoreDashboardPage() {
  const t = useTranslation()
  const dispatch = useDispatch()
  const token = useSelector((state) => state.storeAuth.token)
  const store = useSelector((state) => state.storeAuth.store)
  const { data: meResponse, error: meError } = useGetStoreMeQuery(undefined, { skip: !token })
  const [tab, setTab] = useState('overview')
  const [productSearch, setProductSearch] = useState('')
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('')
  const [inventoryStockFilter, setInventoryStockFilter] = useState('')
  const [inventoryPricingFilter, setInventoryPricingFilter] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState('')
  const [orderSort, setOrderSort] = useState('newest')
  const [orderMotion, setOrderMotion] = useState({})
  const [statusFilter, setStatusFilter] = useState('')
  const [orderTypeFilter, setOrderTypeFilter] = useState('')
  const [openingTimeDraft, setOpeningTimeDraft] = useState(null)
  const [closingTimeDraft, setClosingTimeDraft] = useState(null)
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [invoiceError, setInvoiceError] = useState('')
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState('')
  const [pendingAction, setPendingAction] = useState('')
  const [exportingReport, setExportingReport] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString())
  const [reportFrom, setReportFrom] = useState(() => getLocalDateString())
  const [reportTo, setReportTo] = useState(() => getLocalDateString())
  const followsToday = useRef(true)
  const [productPage, setProductPage] = useState(1)
  const [orderPage, setOrderPage] = useState(1)
  const [transactionPage, setTransactionPage] = useState(1)
  const [auditPage, setAuditPage] = useState(1)
  const orderMotionSnapshot = useRef({ queryKey: '', orders: new Map() })
  const orderMotionTimers = useRef(new Map())
  const [setStock] = useSetStoreProductStockMutation()
  const [exportStoreReport] = useExportStoreReportMutation()
  const [toggleStoreStatus] = useToggleStoreStatusMutation()
  const [updateStoreHours] = useUpdateStoreHoursMutation()
  const [deleteProduct] = useDeleteStoreProductMutation()
  const [updateOrder] = useUpdateStoreOrderStatusMutation()
  const [refundOrder] = useRefundStoreOrderMutation()
  const [downloadStoreOrderInvoice] = useDownloadStoreOrderInvoiceMutation()
  const today = getLocalDateString()
  const selectedDayRange = getLocalDayRange(selectedDate)
  const storeOpenState = meResponse?.account?.isOpen ?? store?.isOpen ?? true
  const storeOpeningTime = meResponse?.account?.openingTime ?? store?.openingTime ?? '09:00'
  const storeClosingTime = meResponse?.account?.closingTime ?? store?.closingTime ?? '21:00'
  const { data: dashboardResponse, error: dashboardError, isLoading: dashboardLoading, refetch: refetchDashboard } = useGetStoreDashboardQuery({ days: 1, ...selectedDayRange }, { skip: !token, pollingInterval: 30000 })
  const { data: productCategoriesResponse, error: productCategoriesError } = useGetStoreProductCategoriesQuery(undefined, { skip: !token || tab !== 'inventory' })
  const productCategories = productCategoriesResponse?.data || productTypes
  const { data: productsResponse, error: productsError, isLoading: productsLoading } = useGetStoreProductsQuery({
    page: productPage,
    limit: 100,
    search: productSearch || undefined,
    productType: inventoryCategoryFilter || undefined,
    inStock: inventoryStockFilter || undefined,
    pricingMode: inventoryPricingFilter || undefined,
  }, { skip: !token || tab !== 'inventory' })
  const orderQueryKey = JSON.stringify([
    selectedDate,
    tab === 'orders' ? orderPage : 1,
    tab === 'orders' ? statusFilter : '',
    tab === 'orders' ? orderTypeFilter : '',
    tab === 'orders' ? debouncedOrderSearch : '',
    tab === 'orders' ? orderSort : 'newest'
  ])
  const { currentData: ordersResponse, error: ordersError, isLoading: ordersLoading, isFetching: ordersFetching } = useGetStoreOrdersQuery({
    page: tab === 'orders' ? orderPage : 1,
    limit: 100,
    from: selectedDayRange.from,
    to: selectedDayRange.to,
    orderStatus: tab === 'orders' ? statusFilter || undefined : undefined,
    orderType: tab === 'orders' ? orderTypeFilter || undefined : undefined,
    search: tab === 'orders' ? debouncedOrderSearch || undefined : undefined,
    sort: tab === 'orders' ? orderSort : 'newest'
  }, { skip: !token, pollingInterval: token ? tab === 'orders' ? 8000 : 30000 : 0 })
  const { data: transactionsResponse, error: transactionsError, isLoading: transactionsLoading } = useGetStoreTransactionsQuery({
    page: tab === 'transactions' ? transactionPage : 1,
    limit: 100,
    from: selectedDayRange.from,
    to: selectedDayRange.to
  }, { skip: !token, pollingInterval: token ? 30000 : 0 })
  const { data: auditResponse, error: auditError, isLoading: auditLoading } = useGetStoreAuditEventsQuery(
    { page: auditPage, limit: 50 },
    { skip: !token || tab !== 'activity' }
  )
  const dashboard = dashboardResponse?.data
  const products = getData(productsResponse)
  const allOrders = getData(ordersResponse)
  const orders = allOrders
  const transactions = getData(transactionsResponse)
  const auditEvents = getData(auditResponse)
  const selectedDayOrders = allOrders
  const selectedDayTransactions = transactions
  const periodMetrics = dashboard?.periodMetrics

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedOrderSearch(orderSearch.trim()), 250)
    return () => clearTimeout(timeout)
  }, [orderSearch])

  useEffect(() => {
    if (!ordersResponse) return
    const currentOrders = ordersResponse.data
    if (orderMotionSnapshot.current.queryKey !== orderQueryKey) {
      orderMotionSnapshot.current = {
        queryKey: orderQueryKey,
        orders: new Map(currentOrders.map((order) => [order._id, { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus }]))
      }
      return
    }

    const nextSnapshot = new Map()
    for (const order of currentOrders) {
      const previous = orderMotionSnapshot.current.orders.get(order._id)
      nextSnapshot.set(order._id, { orderStatus: order.orderStatus, paymentStatus: order.paymentStatus })
      const motion = !previous
        ? 'new'
        : previous.orderStatus !== order.orderStatus || previous.paymentStatus !== order.paymentStatus
          ? 'updated'
          : ''
      if (!motion) continue

      const previousTimer = orderMotionTimers.current.get(order._id)
      if (previousTimer) clearTimeout(previousTimer)
      setOrderMotion((current) => ({ ...current, [order._id]: motion }))
      const timer = setTimeout(() => {
        setOrderMotion((current) => {
          const next = { ...current }
          delete next[order._id]
          return next
        })
        orderMotionTimers.current.delete(order._id)
      }, 8000)
      orderMotionTimers.current.set(order._id, timer)
    }
    orderMotionSnapshot.current.orders = nextSnapshot
  }, [orderQueryKey, orders, ordersResponse])

  useEffect(() => () => {
    for (const timer of orderMotionTimers.current.values()) clearTimeout(timer)
    orderMotionTimers.current.clear()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const currentDate = getLocalDateString()
      if (followsToday.current && selectedDate !== currentDate) {
        setSelectedDate(currentDate)
        setOrderPage(1)
        setTransactionPage(1)
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [selectedDate])

  useEffect(() => {
    if (token && (meError?.status === 401 || meError?.status === 403 || (meResponse?.role && meResponse.role !== 'store'))) {
      dispatch(storeSignedOut())
      dispatch(api.util.resetApiState())
    }
  }, [dispatch, meError, meResponse, token])

  if (!token) return <Navigate to="/store/login" replace />
  if (meError?.status === 401 || meError?.status === 403 || (meResponse?.role && meResponse.role !== 'store')) return <Navigate to="/store/login" replace />

  async function runAction(id, action, task, successMessage = 'Changes saved.') {
    setActionError('')
    setActionSuccess('')
    setPendingAction(`${id}-${action}`)
    try {
      const result = await task()
      setActionSuccess(result?.warnings?.join(' ') || successMessage)
    } catch (requestError) {
      setActionError(getErrorMessage(requestError))
    } finally {
      setPendingAction('')
    }
  }

  async function changeOrderStatus(order, orderStatus) {
    await runAction(order._id, orderStatus, async () => {
      await updateOrder({ orderId: order._id, orderStatus }).unwrap()
    })
  }

  async function requestOrderRefund(order) {
    if (!window.confirm(`Issue a full refund of ${formatPrice(order.totalAmount)} and cancel this order? This cannot be retried automatically if Razorpay's response is uncertain.`)) return
    await runAction(
      order._id,
      'refund',
      () => refundOrder(order._id).unwrap(),
      'Order cancelled. The full refund is pending Razorpay confirmation.'
    )
  }

  function logout() {
    dispatch(storeSignedOut())
    dispatch(api.util.resetApiState())
  }

  function changeSelectedDate(date) {
    if (!date) return
    followsToday.current = date === getLocalDateString()
    setSelectedDate(date)
    setOrderPage(1)
    setTransactionPage(1)
  }

  async function downloadReport(type, range = selectedDayRange, rangeLabel = selectedDate) {
    setActionError('')
    setExportingReport(type)
    try {
      const blob = await exportStoreReport({ type, ...range }).unwrap()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `store-${type}-${rangeLabel}.csv`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (requestError) {
      setActionError(getErrorMessage(requestError))
    } finally {
      setExportingReport('')
    }
  }

  async function downloadInvoice(order) {
    setInvoiceError('')
    setDownloadingInvoiceId(order._id)
    try {
      const blob = await downloadStoreOrderInvoice(order._id).unwrap()
      saveInvoicePdf(blob, order._id)
    } catch (requestError) {
      setInvoiceError(getErrorMessage(requestError))
    } finally {
      setDownloadingInvoiceId('')
    }
  }

  async function toggleStatus() {
    await runAction('status', 'toggle', async () => {
      await toggleStoreStatus(!storeOpenState).unwrap()
    }, `Store marked ${!storeOpenState ? 'open' : 'closed'}.`)
  }

  async function saveStoreHours(event) {
    event.preventDefault()
    await runAction('hours', 'save', async () => {
      await updateStoreHours({
        openingTime: openingTimeDraft || storeOpeningTime,
        closingTime: closingTimeDraft || storeClosingTime
      }).unwrap()
      setOpeningTimeDraft(null)
      setClosingTimeDraft(null)
    }, 'Store hours updated. Pickup slots now use these hours.')
  }

  return <div className="store-workspace min-h-screen bg-[#f1f1ed] text-[var(--text-primary)]">
    <header className="store-workspace-header sticky top-0 z-20 border-b border-[#e5e4de] bg-[#f1f1ed]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/store" className="flex items-center gap-3"><img src="/nallibokka-logo.png" alt="" className="h-9 w-9 object-contain" /><span><span className="block text-sm font-semibold text-[var(--text-primary)]">NalliBokka</span><span className="block text-[10px] text-[var(--text-tertiary)]">{t('Store workspace')}</span></span></Link>
        <div className="flex items-center gap-2 sm:gap-3"><span className="hidden text-right sm:block"><span className="block text-xs font-semibold text-[var(--text-primary)]">{store?.storeName || meResponse?.store?.storeName || t('Your store')}</span><span className="block text-[10px] text-[var(--text-tertiary)]">{store?.location || meResponse?.store?.location}</span></span><LanguageSwitcher compact /><button onClick={logout} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e1dfd8] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-app)]"><LogOut size={14} /><span className="hidden sm:inline">{t('Sign out')}</span></button></div>
      </div>
    </header>
    <div className="store-workspace-layout mx-auto grid max-w-[1600px] gap-5 px-4 py-5 sm:px-6 sm:py-6 md:grid-cols-[172px_minmax(0,1fr)] md:gap-4 md:px-5 lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-6 lg:px-8">
      <aside className="store-workspace-sidebar lg:sticky lg:top-[88px] lg:h-[calc(100vh-104px)]">
        <nav aria-label={t('Store dashboard')} className="store-dashboard-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => {
          setActionError('')
          setActionSuccess('')
          setTab(id)
        }} className={`store-dashboard-nav-item ${tab === id ? 'is-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{t(label)}</span></button>)}</nav>
        <div className="store-sidebar-footer">
          <form onSubmit={saveStoreHours} className="store-hours-form rounded-xl border border-[var(--border-default)] bg-white p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--text-secondary)]">{t('Pickup hours')}</p>
              <span className="text-[9px] text-[var(--text-tertiary)]">30 min · IST</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-[10px] font-semibold text-[var(--text-secondary)]">{t('Opens')}
                <input required type="time" step="1800" value={openingTimeDraft ?? storeOpeningTime} onChange={(event) => setOpeningTimeDraft(event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-[var(--border-default)] bg-white px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
              </label>
              <label className="text-[10px] font-semibold text-[var(--text-secondary)]">{t('Closes')}
                <input required type="time" step="1800" value={closingTimeDraft ?? storeClosingTime} onChange={(event) => setClosingTimeDraft(event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-[var(--border-default)] bg-white px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
              </label>
            </div>
            <button type="submit" disabled={pendingAction === 'hours-save' || ((openingTimeDraft ?? storeOpeningTime) === storeOpeningTime && (closingTimeDraft ?? storeClosingTime) === storeClosingTime)} className="mt-2 h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--brand-primary)] hover:bg-[var(--brand-primary-soft)] disabled:cursor-not-allowed disabled:opacity-50">{pendingAction === 'hours-save' ? 'Saving…' : 'Save pickup hours'}</button>
          </form>
          <section className={`store-availability-card rounded-xl border p-3 transition-colors duration-300 ${storeOpenState ? 'border-[#e3e5dc] bg-[#f8f8f5]' : 'border-[#ead0ca] bg-[var(--bg-app)]'}`} aria-label={t('Store availability')}>
            <div className="store-availability-summary flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${storeOpenState ? 'bg-[#e9eee5] text-[var(--text-secondary)]' : 'bg-[#f4e5e1] text-[var(--status-danger)]'}`}>
                <Power size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-[9px] font-semibold uppercase tracking-[.1em] text-[var(--text-tertiary)]">{t('Store status')}</span>
                <span className={`mt-0.5 flex items-center gap-1.5 text-[11px] font-bold leading-4 ${storeOpenState ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${storeOpenState ? 'bg-[#5c9567] motion-safe:animate-pulse' : 'bg-[var(--status-danger)]'}`} />
                  {t(storeOpenState ? 'Open for orders' : 'Not accepting')}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleStatus}
              disabled={pendingAction === 'status-toggle'}
              aria-pressed={storeOpenState}
              className={`store-availability-toggle mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-lg px-2 font-bold transition duration-200 disabled:cursor-wait disabled:opacity-60 ${storeOpenState ? 'bg-white text-[var(--text-secondary)] ring-1 ring-inset ring-[#e2e0d9] hover:bg-[var(--bg-app)]' : 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)] hover:bg-[var(--brand-secondary)]'}`}
            >
              <Power size={13} />
              {t(pendingAction === 'status-toggle' ? 'Updating…' : storeOpenState ? 'Pause orders' : 'Resume orders')}
            </button>
          </section>
        </div>
      </aside>

      <main key={tab} className="store-workspace-main min-w-0 dashboard-page-transition">
        {tab !== 'inventory' && tab !== 'reports' && tab !== 'activity' && <DateFilter selectedDate={selectedDate} today={today} onChange={changeSelectedDate} />}
        {(actionError || actionSuccess) && <p role={actionError ? 'alert' : 'status'} className={`mb-4 flex items-center gap-2 rounded-xl p-3 text-sm ${actionError ? 'bg-[var(--status-danger-soft)] text-[var(--status-danger)]' : 'bg-[var(--status-success-soft)] text-[var(--status-success)]'}`}>{actionError ? <AlertCircle size={16} /> : <Check size={16} />}{t(actionError || actionSuccess)}</p>}
        {tab === 'overview' && <>
          <SectionTitle eyebrow={selectedDate === today ? 'Today at a glance' : 'Daily snapshot'} title="Store overview"><button onClick={() => refetchDashboard()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e2e0d9] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-app)]"><RefreshCw size={14} />{t('Refresh')}</button></SectionTitle>
          {dashboardError && <p role="alert" className="mb-4 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{getErrorMessage(dashboardError)}</p>}
          {(ordersError || transactionsError) && <p role="alert" className="mb-4 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{ordersError && `Orders: ${getErrorMessage(ordersError)} `}{transactionsError && `Transactions: ${getErrorMessage(transactionsError)}`}</p>}
          {dashboardLoading || ordersLoading || transactionsLoading ? <StoreLoader label={t('Preparing your store overview…')} compact /> : <div className="dashboard-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={selectedDate === today ? 'Orders today' : 'Orders'} value={periodMetrics?.orders ?? '—'} detail="Placed on the selected day" icon={ClipboardList} />
            <MetricCard label={selectedDate === today ? 'Paid revenue today' : 'Paid revenue'} value={periodMetrics ? formatPrice(periodMetrics.paidRevenue) : '—'} detail={`${periodMetrics?.paidTransactions ?? '—'} paid transactions on this day`} icon={ArrowUpRight} tone="green" />
            <MetricCard label="In stock" value={dashboard?.inventory?.inStock ?? '—'} detail="Active inventory products" icon={Boxes} tone="coral" />
            <MetricCard label="Sold out" value={dashboard?.inventory?.outOfStock ?? '—'} detail="Products needing restock" icon={ArrowDownRight} />
          </div>}
          <section className="mt-5 rounded-[18px] border border-[var(--border-default)] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[var(--brand-primary)]">{t('Daily activity')}</p><h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">{t('Orders for this day')}</h2></div><button onClick={() => setTab('orders')} className="text-xs font-semibold text-[var(--brand-primary)]">{t('View all orders')} →</button></div>
            <div className="dashboard-stagger mt-4 space-y-2">{selectedDayOrders.slice(0, 5).map((order) => <div key={order._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--bg-app)] p-3 transition duration-200 hover:translate-x-1 hover:bg-[#fbf0eb]"><div><p className="text-xs font-semibold">#{order._id.slice(-8).toUpperCase()} · {typeof order.userId === 'object' ? order.userId?.name : 'Customer'}</p><p className="mt-1 text-[10px] text-[var(--text-secondary)]">{new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {order.orderStatus}</p></div><span className="text-sm font-semibold">{formatPrice(order.totalAmount)}</span></div>)}
              {!selectedDayOrders.length && <p className="rounded-xl bg-[var(--bg-app)] p-4 text-center text-xs text-[var(--text-secondary)]">{t('No orders on this day.')}</p>}</div>
            {dashboard?.paidRevenue && <p className="mt-3 text-[10px] text-[var(--text-secondary)]">Revenue overview API reports a rolling period ({dashboard.paidRevenue.sinceDays} day). Daily totals use server aggregates for local midnight boundaries.</p>}
          </section>
        </>}

        {tab === 'orders' && <>
          <SectionTitle eyebrow="Order management" title={selectedDate === today ? 'Live orders' : 'Orders'}>
            <div className="flex flex-wrap items-center gap-2">
              {selectedDate === today && <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--status-success-soft)] px-3 text-[10px] font-bold uppercase tracking-[.08em] text-[var(--status-success)]"><span className="h-1.5 w-1.5 rounded-full bg-[#5c9567] motion-safe:animate-pulse" />{t('Live · 8 sec')}</span>}
              <label className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 text-xs text-[var(--text-secondary)]"><Truck size={14} /><select aria-label={t('Filter orders by fulfillment')} value={orderTypeFilter} onChange={(event) => { setOrderTypeFilter(event.target.value); setOrderPage(1) }} className="bg-transparent outline-none"><option value="">{t('All order types')}</option><option value="delivery">{t('Delivery')}</option><option value="pickup">{t('Store pickup')}</option></select></label>
              <label className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 text-xs text-[var(--text-secondary)]"><Clock3 size={14} /><select aria-label={t('Filter orders by status')} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setOrderPage(1) }} className="bg-transparent outline-none"><option value="">{t('All statuses')}</option>{['placed', 'packing', 'out for delivery', 'ready for pickup', 'delivered', 'picked up', 'cancelled'].map((status) => <option key={status} value={status}>{t(status)}</option>)}</select></label>
              <label className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 text-xs text-[var(--text-secondary)]"><select aria-label={t('Sort orders')} value={orderSort} onChange={(event) => { setOrderSort(event.target.value); setOrderPage(1) }} className="bg-transparent outline-none"><option value="newest">{t('Newest first')}</option><option value="oldest">{t('Oldest first')}</option><option value="amount_desc">{t('Highest total')}</option><option value="amount_asc">{t('Lowest total')}</option></select></label>
            </div>
          </SectionTitle>
          <label className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm text-[var(--text-secondary)] transition focus-within:border-[var(--brand-primary)] focus-within:shadow-[0_0_0_3px_rgba(223,118,103,.12)]">
            <Search size={16} className="shrink-0 text-[var(--brand-primary)]" />
            <input value={orderSearch} onChange={(event) => { setOrderSearch(event.target.value); setOrderPage(1) }} placeholder={t('Search order ID, customer name or phone')} className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]" />
            {orderSearch && <button type="button" aria-label={t('Clear order search')} onClick={() => { setOrderSearch(''); setOrderPage(1) }} className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-[#f7eee8]"><X size={14} /></button>}
          </label>
          <div className="mb-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-3 text-xs leading-5 text-[var(--text-secondary)]">{t('Accept paid orders to move them into preparation. Delivery orders progress to')} <strong>{t('Out for delivery')}</strong>; {t('pickup orders progress to')} <strong>{t('Ready for pickup')}</strong>. {t('Decline requests cancellation; the server enforces its payment restrictions.')}</div>
          {ordersFetching && !ordersLoading && <p role="status" className="mb-3 flex items-center gap-2 text-[10px] font-medium text-[var(--text-secondary)]"><span className="h-3 w-3 rounded-full border-2 border-[var(--border-default)] border-t-[var(--brand-primary)] motion-safe:animate-spin" />{t('Refreshing orders')}</p>}
          {ordersError && <p role="alert" className="mb-3 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{getErrorMessage(ordersError)}</p>}
          {invoiceError && <p role="alert" className="mb-3 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{invoiceError}</p>}
          {ordersLoading ? <StoreLoader label={t('Fetching today’s orders…')} compact /> : orders.length ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{orders.map((order) => {
            const customer = typeof order.userId === 'object' ? order.userId : {}
            const next = order.orderStatus === 'packing'
              ? order.orderType === 'pickup' ? 'ready for pickup' : 'out for delivery'
              : order.orderStatus === 'out for delivery' ? 'delivered'
                : order.orderStatus === 'ready for pickup' ? 'picked up'
                  : null
            const paymentConfirmed = ['paid', 'refund_failed'].includes(order.paymentStatus)
            const motion = orderMotion[order._id]
            return <article key={order._id} className={`rounded-[18px] border bg-white p-4 transition-all duration-500 sm:p-5 ${motion === 'new' ? 'order-live-new border-[var(--brand-primary)] shadow-[0_14px_42px_-24px_rgba(134,25,35,.55)]' : motion === 'updated' ? 'order-live-updated border-[#d7e6d8]' : 'border-[var(--border-default)]'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--brand-primary)]">{t('Order')} #{order._id.slice(-8).toUpperCase()}</p><span className="rounded-full bg-[var(--brand-primary-soft)] px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[var(--brand-primary)]">{t(order.orderType === 'pickup' ? 'Store pickup' : 'Delivery')}</span>{motion && <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] ${motion === 'new' ? 'bg-[var(--status-danger-soft)] text-[var(--brand-primary)]' : 'bg-[var(--status-success-soft)] text-[var(--status-success)]'}`}>{t(motion === 'new' ? 'New order' : 'Just updated')}</span>}</div><h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{customer.name || t('Customer')} <span className="font-normal text-[var(--text-secondary)]">{customer.phone || ''}</span></h3><p className="mt-1 text-[10px] text-[var(--text-secondary)]">{new Date(order.createdAt).toLocaleString('en-IN')}</p>{order.orderType === 'pickup' ? <p className="mt-1 text-xs font-semibold text-[var(--brand-primary)]">{t('Pickup')}: {new Date(order.pickupAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</p> : <p className="mt-1 text-xs text-[var(--text-secondary)]">{order.deliveryAddress?.fullAddress} · {order.deliveryAddress?.pincode}</p>}</div><div className="text-right"><p className="text-base font-semibold">{formatPrice(order.totalAmount)}</p><p className="mt-1 text-[10px] capitalize text-[var(--text-secondary)]">{t('Payment')}: {t(order.paymentStatus)}</p></div></div>
              <div className={`mt-3 space-y-1 border-t border-[var(--surface-subtle)] pt-3 ${motion ? 'order-items-highlight' : ''}`}>{order.items?.map((item, index) => <p key={`${item.productId}-${index}`} className={`rounded-lg px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors ${motion ? 'bg-[#fff5ed] text-[var(--text-secondary)]' : ''}`}><span className="font-semibold">{t(item.productName)}</span> · {t(formatItemQuantity(item))}</p>)}</div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${order.orderStatus === 'placed' ? 'bg-[var(--status-danger-soft)] text-[var(--brand-primary)]' : order.orderStatus === 'delivered' ? 'bg-[var(--status-success-soft)] text-[var(--status-success)]' : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]'}`}>{t(order.orderStatus)}</span><div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadInvoice(order)} disabled={Boolean(downloadingInvoiceId)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dfe7dc] px-3 text-xs font-semibold text-[var(--status-success)] hover:bg-[var(--bg-app)] disabled:cursor-wait disabled:opacity-50"><FileText size={14} />{t(downloadingInvoiceId === order._id ? 'Preparing PDF…' : 'Download invoice')}</button>
                {order.orderStatus === 'placed' && <><button disabled={!paymentConfirmed || pendingAction === `${order._id}-packing`} title={!paymentConfirmed ? t('The API allows accepting an order only after payment is confirmed.') : undefined} onClick={() => changeOrderStatus(order, 'packing')} className="h-9 rounded-lg bg-[var(--brand-primary)] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{t(pendingAction === `${order._id}-packing` ? 'Accepting…' : paymentConfirmed ? 'Accept order' : 'Awaiting payment')}</button><button disabled={pendingAction === `${order._id}-cancelled`} onClick={() => changeOrderStatus(order, 'cancelled')} className="h-9 rounded-lg border border-[var(--border-default)] px-3 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-55">{t('Decline')}</button></>}
                {['placed', 'packing'].includes(order.orderStatus) && order.paymentStatus === 'paid' && <button disabled={pendingAction === `${order._id}-refund`} onClick={() => requestOrderRefund(order)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-55"><RotateCcw size={13} />{t(pendingAction === `${order._id}-refund` ? 'Requesting…' : 'Full refund')}</button>}
                {next && <button disabled={pendingAction === `${order._id}-${next}`} onClick={() => changeOrderStatus(order, next)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-3 text-xs font-semibold text-white disabled:opacity-55">{['delivered', 'picked up'].includes(next) ? <Check size={14} /> : <Truck size={14} />}{t(pendingAction === `${order._id}-${next}` ? 'Updating…' : next === 'delivered' ? 'Mark delivered' : next === 'picked up' ? 'Mark picked up' : next === 'ready for pickup' ? 'Mark ready for pickup' : 'Out for delivery')}</button>}
              </div></div>
            </article>
          })}</div> : <div className="rounded-[18px] border border-[var(--border-default)] bg-white p-10 text-center"><ClipboardList className="mx-auto text-[var(--brand-primary)]" size={26} /><h3 className="mt-3 text-sm font-semibold">{t(debouncedOrderSearch ? 'No matching orders' : 'No orders on this day')}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{t(debouncedOrderSearch ? 'Try a different order ID, customer name, or phone number.' : 'Orders placed on the selected day will show up here.')}</p></div>}
          {!ordersLoading && <PaginationControls pagination={ordersResponse?.pagination} page={orderPage} onPageChange={setOrderPage} />}
        </>}

        {tab === 'inventory' && <>
          <SectionTitle eyebrow="Your catalog" title="Inventory"><button onClick={() => { setEditingProduct(null); setShowProductForm((value) => !value) }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--brand-primary-hover)]"><PackagePlus size={15} />{t('Add product')}</button></SectionTitle>
          {showProductForm && <ProductForm key={editingProduct?._id || 'new-product'} product={editingProduct} categories={productCategories} onCancel={() => { setShowProductForm(false); setEditingProduct(null) }} onSaved={(warnings = []) => { setShowProductForm(false); setEditingProduct(null); setActionSuccess(warnings.length ? warnings.join(' ') : editingProduct ? 'Product changes saved.' : 'Product added to inventory.') }} />}
          {productCategoriesError && <p role="alert" className="mb-3 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{getErrorMessage(productCategoriesError)}</p>}
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 text-xs text-[var(--text-secondary)] sm:col-span-2"><Search size={14} /><input value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductPage(1) }} placeholder={t('Search products')} className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none" /></label>
            <label className="flex h-10 items-center rounded-lg border border-[var(--border-default)] bg-white px-3 text-xs text-[var(--text-secondary)]"><select aria-label={t('Filter inventory by category')} value={inventoryCategoryFilter} onChange={(event) => { setInventoryCategoryFilter(event.target.value); setProductPage(1) }} className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"><option value="">{t('All categories')}</option>{productCategories.map((category) => <option key={category} value={category}>{t(formatCategoryLabel(category))}</option>)}</select></label>
            <label className="flex h-10 items-center rounded-lg border border-[var(--border-default)] bg-white px-3 text-xs text-[var(--text-secondary)]"><select aria-label={t('Filter inventory by stock status')} value={inventoryStockFilter} onChange={(event) => { setInventoryStockFilter(event.target.value); setProductPage(1) }} className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"><option value="">{t('All stock states')}</option><option value="true">{t('In stock')}</option><option value="false">{t('Sold out')}</option></select></label>
            <label className="flex h-10 items-center rounded-lg border border-[var(--border-default)] bg-white px-3 text-xs text-[var(--text-secondary)]"><select aria-label={t('Filter inventory by pricing')} value={inventoryPricingFilter} onChange={(event) => { setInventoryPricingFilter(event.target.value); setProductPage(1) }} className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"><option value="">{t('All pricing types')}</option><option value="weight">{t('Per kilogram')}</option><option value="pack">{t('Fixed-price packs')}</option></select></label>
          </div>
          {productsError && <p role="alert" className="mb-3 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{getErrorMessage(productsError)}</p>}
          {productsLoading ? <StoreLoader label={t('Preparing your inventory…')} compact /> : products.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{products.map((product) => <article key={product._id} className="overflow-hidden rounded-[16px] border border-[var(--border-default)] bg-white">
            <div className="flex gap-3 p-3"><img src={product.imageUrl} alt={t(product.productName)} className="h-16 w-16 rounded-xl bg-[var(--surface-subtle)] object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{t(product.productName)}</p><span className="mt-1 inline-flex rounded-full bg-[var(--brand-primary-soft)] px-2 py-0.5 text-[9px] font-semibold text-[var(--brand-primary)]">{t(formatCategoryLabel(product.productType))}</span><p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">{product.packs?.length ? product.packs.map(({ label, price }) => `${t(label)} ${formatPrice(price)}`).join(' · ') : `${formatPrice(product.pricePerKg)} / ${t('kg')}`}</p></div></div>
            <div className="flex items-center justify-between border-t border-[var(--surface-subtle)] px-3 py-2.5"><button onClick={() => runAction(product._id, 'stock', () => setStock({ productId: product._id, inStock: !product.inStock }).unwrap())} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${product.inStock ? 'bg-[var(--status-success-soft)] text-[var(--status-success)]' : 'bg-[var(--status-danger-soft)] text-[var(--brand-primary)]'}`}>{t(product.inStock ? 'In stock' : 'Sold out')} · {t('toggle')}</button><div className="flex items-center"><button onClick={() => { setEditingProduct(product); setShowProductForm(true); setActionError(''); setActionSuccess('') }} aria-label={`${t('Edit')} ${t(product.productName)}`} className="rounded-lg px-2 py-1.5 text-[10px] font-semibold text-[var(--brand-primary)] hover:bg-[var(--status-danger-soft)]">{t('Edit')}</button><button onClick={() => { if (window.confirm(`${t('Delete')} ${t(product.productName)} ${t('from inventory?')}`)) runAction(product._id, 'delete', () => deleteProduct(product._id).unwrap()) }} aria-label={`${t('Delete')} ${t(product.productName)}`} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--status-danger-soft)] hover:text-[var(--brand-primary)]"><Trash2 size={15} /></button></div></div>
          </article>)}</div> : <div className="rounded-[18px] border border-[var(--border-default)] bg-white p-10 text-center"><Boxes className="mx-auto text-[var(--brand-primary)]" size={26} /><h3 className="mt-3 text-sm font-semibold">{t('No products found')}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{t('Add your first product or adjust search.')}</p></div>}
          {!productsLoading && <PaginationControls pagination={productsResponse?.pagination} page={productPage} onPageChange={setProductPage} />}
        </>}

        {tab === 'transactions' && <>
          <SectionTitle eyebrow="Payments" title={selectedDate === today ? 'Transactions today' : 'Transactions'}><span className="text-xs text-[var(--text-secondary)]">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span></SectionTitle>
          {transactionsError && <p role="alert" className="mb-3 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{getErrorMessage(transactionsError)}</p>}
          {transactionsLoading ? <StoreLoader label="Loading transactions…" compact /> : <>
            <div className="dashboard-stagger mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><MetricCard label={selectedDate === today ? 'Paid today' : 'Paid revenue'} value={periodMetrics ? formatPrice(periodMetrics.paidRevenue) : '—'} detail={`${periodMetrics?.paidTransactions ?? '—'} captured payments on this day`} icon={ArrowUpRight} tone="green" /><MetricCard label={selectedDate === today ? 'Transactions today' : 'Transactions'} value={periodMetrics ? Object.values(periodMetrics.transactions).reduce((sum, count) => sum + count, 0) : '—'} detail="All payment statuses" icon={CreditCard} /><MetricCard label={selectedDate === today ? 'Failed today' : 'Failed transactions'} value={periodMetrics?.transactions?.failed ?? '—'} detail="Payment attempts" icon={ArrowDownRight} tone="coral" /></div>
            {selectedDayTransactions.length ? <div className="dashboard-stagger overflow-hidden rounded-[18px] border border-[var(--border-default)] bg-white"><div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 border-b border-[var(--surface-subtle)] bg-[var(--bg-app)] px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] sm:grid"><span>{t('Order')}</span><span>{t('Time')}</span><span>{t('Status')}</span><span className="text-right">{t('Amount')}</span></div>{selectedDayTransactions.map((transaction) => <div key={transaction._id} className="grid gap-1 border-b border-[#f4eeea] px-4 py-3 last:border-0 transition-colors hover:bg-[var(--bg-app)] sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center sm:gap-3"><span className="text-xs font-semibold">#{String(transaction.orderId?._id || transaction.orderId).slice(-8).toUpperCase()}</span><span className="text-[11px] text-[var(--text-secondary)]">{new Date(transaction.timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span><span className={`w-fit rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${transaction.refundStatus === 'pending' || transaction.refundStatus === 'failed' ? 'bg-[var(--status-danger-soft)] text-[var(--brand-primary)]' : transaction.refundStatus === 'processed' ? 'bg-[var(--status-success-soft)] text-[var(--status-success)]' : transaction.status === 'paid' ? 'bg-[var(--status-success-soft)] text-[var(--status-success)]' : transaction.status === 'failed' ? 'bg-[var(--status-danger-soft)] text-[var(--brand-primary)]' : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]'}`}>{t(transaction.refundStatus && transaction.refundStatus !== 'none' ? `refund ${transaction.refundStatus}` : transaction.status)}</span><span className="text-xs font-semibold sm:text-right">{formatPrice(transaction.amount)}</span></div>)}</div> : <div className="rounded-[18px] border border-[var(--border-default)] bg-white p-10 text-center"><CreditCard className="mx-auto text-[var(--brand-primary)]" size={26} /><h3 className="mt-3 text-sm font-semibold">{t('No transactions on this day')}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{t('Payment activity for the selected day will appear here.')}</p></div>}
          </>}
          {!transactionsLoading && <PaginationControls pagination={transactionsResponse?.pagination} page={transactionPage} onPageChange={setTransactionPage} />}
        </>}

        {tab === 'activity' && <>
          <SectionTitle eyebrow="Store history" title="Activity log" />
          <p className="mb-4 rounded-xl border border-[var(--border-default)] bg-white p-3 text-xs leading-5 text-[var(--text-secondary)]">{t('Recent operational changes made by this store account. Audit entries are retained for one year and do not include customer contact or address details.')}</p>
          {auditError && <p role="alert" className="mb-3 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{getErrorMessage(auditError)}</p>}
          {auditLoading ? <StoreLoader label="Loading activity…" compact /> : auditEvents.length ? <div className="space-y-2">
            {auditEvents.map((event) => <article key={event._id} className="rounded-[16px] border border-[var(--border-default)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-sm font-semibold text-[var(--text-primary)]">{event.action.replaceAll('.', ' ').replaceAll('_', ' ')}</p><p className="mt-1 text-xs capitalize text-[var(--text-secondary)]">{event.entityType} · {event.entityId.slice(-8).toUpperCase()}</p></div>
                <time className="text-[11px] text-[var(--text-secondary)]" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('en-IN')}</time>
              </div>
              {(event.previousState || event.nextState) && <p className="mt-2 text-xs text-[var(--text-secondary)]">{t('Changed from')} <strong>{t(event.previousState || '—')}</strong> {t('to')} <strong>{t(event.nextState || '—')}</strong></p>}
              {event.changedFields?.length > 0 && <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{t('Fields')}: {event.changedFields.join(', ')}</p>}
              {event.requestId && <p className="mt-2 break-all font-mono text-[10px] text-[var(--text-secondary)]">{t('Request')} {event.requestId}</p>}
            </article>)}
          </div> : !auditError && <div className="rounded-[18px] border border-[var(--border-default)] bg-white p-10 text-center"><Activity className="mx-auto text-[var(--brand-primary)]" size={26} /><h3 className="mt-3 text-sm font-semibold">{t('No activity recorded yet')}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{t('Store changes will appear here.')}</p></div>}
          <PaginationControls pagination={auditResponse?.pagination} page={auditPage} onPageChange={setAuditPage} />
        </>}

        {tab === 'reports' && <>
          <SectionTitle eyebrow="Exports" title="Reports & exports" />
          <section className="dashboard-enter mb-5 rounded-[20px] border border-[var(--border-default)] bg-white p-5 shadow-[0_16px_42px_-32px_rgba(91,43,33,.55)] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--status-danger-soft)] text-[var(--brand-primary)]"><CalendarDays size={20} /></span>
              <div><h2 className="text-sm font-semibold text-[var(--text-primary)]">{t('Choose a date range')}</h2><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{t('Reports include activity from the start of the first day through the end of the last day, in your local timezone.')}</p></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <label className="text-xs font-semibold text-[var(--text-secondary)]">{t('FROM')}
                <input type="date" value={reportFrom} max={today} onChange={(event) => setReportFrom(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
              </label>
              <span className="hidden pb-3 text-xs text-[var(--brand-primary)] sm:block">{t('through')}</span>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">{t('TO')}
                <input type="date" value={reportTo} min={reportFrom} max={today} onChange={(event) => setReportTo(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]" />
              </label>
            </div>
            {reportTo < reportFrom && <p role="alert" className="mt-3 text-xs text-rose-700">{t('The end date must be the same as or later than the start date.')}</p>}
          </section>
          <div className="dashboard-stagger grid gap-4 md:grid-cols-2">
            {[
              { type: 'orders', title: 'Orders report', description: 'Order dates, fulfillment and payment statuses, totals, and item summaries.' },
              { type: 'transactions', title: 'Payments report', description: 'Payment and refund activity, transaction amounts, and provider references.' },
            ].map(({ type, title, description }) => (
              <article key={type} className="rounded-[20px] border border-[var(--border-default)] bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-[var(--brand-primary)] hover:shadow-[0_18px_42px_-28px_rgba(91,43,33,.4)] sm:p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--text-secondary)]"><Download size={18} /></span>
                <h2 className="mt-4 text-base font-semibold text-[var(--text-primary)]">{t(title)}</h2>
                <p className="mt-1 min-h-10 text-xs leading-5 text-[var(--text-secondary)]">{t(description)}</p>
                <button
                  type="button"
                  disabled={Boolean(exportingReport) || !reportFrom || !reportTo || reportTo < reportFrom}
                  onClick={() => {
                    const end = new Date(`${reportTo}T00:00:00`)
                    end.setDate(end.getDate() + 1)
                    const rangeLabel = reportFrom === reportTo ? reportFrom : `${reportFrom}-to-${reportTo}`
                    downloadReport(type, {
                      from: new Date(`${reportFrom}T00:00:00`).toISOString(),
                      to: end.toISOString(),
                    }, rangeLabel)
                  }}
                  className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-4 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Download size={14} />{exportingReport === type ? t('Preparing CSV…') : t(type === 'orders' ? 'Download orders CSV' : 'Download transactions CSV')}
                </button>
              </article>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-[#e7d5cc] bg-[#fff9f6] p-3 text-xs leading-5 text-[var(--text-secondary)]">{t('Exports are scoped to your store. Customer phone numbers and delivery addresses are not included.')}</p>
        </>}

        {dashboardError && tab !== 'overview' && !dashboard && <p role="alert" className="mt-4 rounded-xl bg-[var(--status-danger-soft)] p-3 text-sm text-[var(--status-danger)]">{getErrorMessage(dashboardError)}</p>}
      </main>
    </div>
  </div>
}
