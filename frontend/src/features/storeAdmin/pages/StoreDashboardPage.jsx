import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  Activity, AlertCircle, ArrowDownRight, ArrowUpRight, Boxes, CalendarDays, Check, ChevronLeft,
  ChevronRight, ClipboardList, Clock3, CreditCard, LayoutDashboard, LogOut, PackagePlus,
  Download, Power, RefreshCw, RotateCcw, Search, Trash2, Truck, X,
} from 'lucide-react'
import {
  useCreateStoreProductMutation, useDeleteStoreProductMutation, useExportStoreReportMutation,
  useGetStoreDashboardQuery,
  useGetStoreMeQuery, useGetStoreOrdersQuery, useGetStoreProductsQuery,
  useGetStoreAuditEventsQuery, useGetStoreTransactionsQuery, useSetStoreProductStockMutation, useToggleStoreStatusMutation,
  useUpdateStoreOrderStatusMutation,
  useRefundStoreOrderMutation, useUpdateStoreProductMutation,
} from '../../api/api.js'
import { api } from '../../api/api.js'
import { getErrorMessage, formatPrice } from '../../customer/utils.js'
import MeatCuttingLoader from '../components/MeatCuttingLoader.jsx'
import { storeSignedOut } from '../storeAuthSlice.js'

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'transactions', label: 'Transactions', icon: CreditCard },
  { id: 'activity', label: 'Activity log', icon: Activity },
  { id: 'reports', label: 'Reports', icon: Download },
]
const productTypes = ['meat', 'vegetable', 'fruit', 'oil', 'rice']
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

  return <section className="dashboard-enter mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[#eadfd7] bg-white p-4 shadow-[0_12px_35px_-28px_rgba(91,43,33,.45)] sm:p-5">
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fbefec] text-[#9b5148]"><CalendarDays size={20} /></span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#ad7669]">{selectedDate === today ? "Today's activity" : 'Daily report'}</p>
        <p className="mt-1 truncate text-sm font-semibold text-[#493631]">{dateLabel}</p>
      </div>
    </div>
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <button type="button" onClick={() => shiftDate(-1)} aria-label="View previous day" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#eadfd7] text-[#76534a] transition hover:-translate-x-0.5 hover:bg-[#fff8f4]"><ChevronLeft size={17} /></button>
      <label className="relative flex h-10 min-w-0 flex-1 items-center rounded-xl border border-[#eadfd7] bg-[#fffdfa] px-3 text-xs font-semibold text-[#76534a] transition focus-within:border-[#c98c7f] sm:w-44 sm:flex-none">
        <CalendarDays className="mr-2 shrink-0 text-[#ad7669]" size={15} />
        <input aria-label="Select dashboard date" type="date" value={selectedDate} max={today} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-[#493631] outline-none" />
      </label>
      <button type="button" onClick={() => shiftDate(1)} disabled={selectedDate >= today} aria-label="View next day" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#eadfd7] text-[#76534a] transition hover:translate-x-0.5 hover:bg-[#fff8f4] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={17} /></button>
      {selectedDate !== today && <button type="button" onClick={() => onChange(today)} className="h-10 shrink-0 rounded-xl bg-[#861923] px-3 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#70131c]">Today</button>}
    </div>
  </section>
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'wine' }) {
  const colors = tone === 'green'
    ? 'bg-[#eef4ed] text-[#4f7754]'
    : tone === 'coral'
      ? 'bg-[#fbefec] text-[#a55549]'
      : 'bg-[#f5eee8] text-[#87634f]'
  return <article className="rounded-[18px] border border-[#eadfd7] bg-white p-4 transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_32px_-24px_rgba(91,43,33,.5)] sm:p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-[#82736d]">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[#392824]">{value}</p><p className="mt-1 text-[11px] text-[#9a8b83]">{detail}</p></div><span className={`grid h-10 w-10 place-items-center rounded-xl ${colors}`}><Icon size={18} /></span></div>
  </article>
}

function SectionTitle({ eyebrow, title, children }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#ad7669]">{eyebrow}</p><h1 className="mt-1 font-display text-2xl font-medium tracking-[-.03em] text-[#392824] sm:text-[28px]">{title}</h1></div>{children}</div>
}

function PaginationControls({ pagination, page, onPageChange }) {
  if (!pagination || pagination.pages <= 1) return null
  const outOfRange = page > pagination.pages
  const previousPage = outOfRange ? Math.max(1, pagination.pages) : page - 1
  return <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[#82736d]">
    <span>Page {page} of {pagination.pages} · {pagination.total} total</span>
    <div className="flex gap-2">
      <button disabled={page <= 1} onClick={() => onPageChange(previousPage)} className="rounded-lg border border-[#eadfd7] bg-white px-3 py-2 font-semibold disabled:opacity-45">{outOfRange ? 'Return to last page' : 'Previous'}</button>
      <button disabled={outOfRange || page >= pagination.pages} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-[#eadfd7] bg-white px-3 py-2 font-semibold disabled:opacity-45">Next</button>
    </div>
  </div>
}

function ProductForm({ product, onCancel, onSaved }) {
  const [createProduct, createState] = useCreateStoreProductMutation()
  const [updateProduct, updateState] = useUpdateStoreProductMutation()
  const [form, setForm] = useState(() => ({
    productType: product?.productType || 'meat',
    productName: product?.productName || '',
    imageUrl: product?.imageUrl || '',
    pricePerKg: product?.pricePerKg ?? '',
    riceMode: product?.packs?.length ? 'pack' : 'weight',
    packs: product?.packs?.length ? product.packs.map(({ label, price }) => ({ label, price })) : [{ label: '', price: '' }],
  }))
  const [error, setError] = useState('')
  const packPricing = form.productType === 'oil' || (form.productType === 'rice' && form.riceMode === 'pack')
  const isSaving = createState.isLoading || updateState.isLoading

  async function submit(event) {
    event.preventDefault()
    setError('')
    const body = {
      productType: form.productType,
      productName: form.productName.trim(),
      imageUrl: form.imageUrl.trim(),
    }
    if (packPricing) body.packs = form.packs.map(({ label, price }) => ({ label: label.trim(), price: Number(price) }))
    else body.pricePerKg = Number(form.pricePerKg)
    try {
      if (product) {
        body.inStock = product.inStock
        if (product.packs?.length && !packPricing) body.packs = []
        if (!product.packs?.length && packPricing) body.pricePerKg = null
        await updateProduct({ productId: product._id, ...body }).unwrap()
      } else {
        body.inStock = true
        await createProduct(body).unwrap()
      }
      onSaved()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  function changeType(productType) {
    setForm((current) => ({ ...current, productType, riceMode: productType === 'rice' ? current.riceMode : 'weight' }))
  }

  return <form onSubmit={submit} className="mt-4 rounded-[18px] border border-[#eadfd7] bg-[#fffdfa] p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-[#493631]">{product ? `Edit ${product.productName}` : 'Add product to inventory'}</h3><p className="mt-1 text-xs text-[#8b7d76]">Products use the catalog categories supported by the server.</p></div><button type="button" onClick={onCancel} className="text-xs font-semibold text-[#9b5148]">Cancel</button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-[#76534a]">CATEGORY
        <select disabled={Boolean(product)} value={form.productType} onChange={(event) => changeType(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[#eadfd7] bg-white px-3 text-sm font-normal text-[#392824] outline-none focus:border-[#c98c7f] disabled:bg-[#f7f3ef]">{productTypes.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select>
      </label>
      <label className="text-xs font-semibold text-[#76534a]">PRODUCT NAME
        <input required maxLength={120} value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#eadfd7] bg-white px-3 text-sm font-normal text-[#392824] outline-none focus:border-[#c98c7f]" placeholder="Product name" />
      </label>
      <label className="text-xs font-semibold text-[#76534a] sm:col-span-2">IMAGE URL
        <input required type="url" maxLength={2048} value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#eadfd7] bg-white px-3 text-sm font-normal text-[#392824] outline-none focus:border-[#c98c7f]" placeholder="https://…" />
      </label>
      {form.productType === 'rice' && <label className="text-xs font-semibold text-[#76534a]">RICE PRICING
        <select value={form.riceMode} onChange={(event) => setForm({ ...form, riceMode: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#eadfd7] bg-white px-3 text-sm font-normal text-[#392824] outline-none focus:border-[#c98c7f]"><option value="weight">Loose — price per kg</option><option value="pack">Packaged — pack prices</option></select>
      </label>}
      {packPricing ? <div className="sm:col-span-2">
        <div className="flex items-center justify-between"><p className="text-xs font-semibold text-[#76534a]">PACKS & PRICES</p><button type="button" onClick={() => setForm({ ...form, packs: [...form.packs, { label: '', price: '' }] })} className="text-xs font-semibold text-[#861923]">+ Add pack</button></div>
        <div className="mt-2 space-y-2">{form.packs.map((pack, index) => <div key={index} className="grid grid-cols-[1fr_120px_34px] gap-2">
          <input required maxLength={40} aria-label={`Pack ${index + 1} label`} value={pack.label} onChange={(event) => setForm({ ...form, packs: form.packs.map((current, i) => i === index ? { ...current, label: event.target.value } : current) })} className="h-10 min-w-0 rounded-lg border border-[#eadfd7] bg-white px-3 text-sm outline-none focus:border-[#c98c7f]" placeholder="e.g. 1 L" />
          <input required type="number" min="0" step="0.01" aria-label={`Pack ${index + 1} price`} value={pack.price} onChange={(event) => setForm({ ...form, packs: form.packs.map((current, i) => i === index ? { ...current, price: event.target.value } : current) })} className="h-10 min-w-0 rounded-lg border border-[#eadfd7] bg-white px-3 text-sm outline-none focus:border-[#c98c7f]" placeholder="Price ₹" />
          <button type="button" disabled={form.packs.length === 1} onClick={() => setForm({ ...form, packs: form.packs.filter((_, i) => i !== index) })} aria-label={`Remove pack ${index + 1}`} className="grid h-10 place-items-center rounded-lg text-[#9b8178] hover:bg-[#f8eeea] disabled:opacity-35"><Trash2 size={15} /></button>
        </div>)}</div>
      </div> : <label className="text-xs font-semibold text-[#76534a]">PRICE PER KG (₹)
        <input required type="number" min="0" step="0.01" value={form.pricePerKg} onChange={(event) => setForm({ ...form, pricePerKg: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#eadfd7] bg-white px-3 text-sm font-normal text-[#392824] outline-none focus:border-[#c98c7f]" placeholder="0.00" />
      </label>}
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-[#fbefec] p-3 text-xs text-[#8c4034]">{error}</p>}
    <div className="mt-4 flex justify-end"><button disabled={isSaving} className="h-10 rounded-lg bg-[#861923] px-5 text-sm font-semibold text-white hover:bg-[#70131c] disabled:opacity-55">{isSaving ? 'Saving…' : product ? 'Save changes' : 'Save product'}</button></div>
  </form>
}

export default function StoreDashboardPage() {
  const dispatch = useDispatch()
  const token = useSelector((state) => state.storeAuth.token)
  const store = useSelector((state) => state.storeAuth.store)
  const { data: meResponse, error: meError } = useGetStoreMeQuery(undefined, { skip: !token })
  const [tab, setTab] = useState('overview')
  const [productSearch, setProductSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [debouncedOrderSearch, setDebouncedOrderSearch] = useState('')
  const [orderSort, setOrderSort] = useState('newest')
  const [orderMotion, setOrderMotion] = useState({})
  const [statusFilter, setStatusFilter] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
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
  const [deleteProduct] = useDeleteStoreProductMutation()
  const [updateOrder] = useUpdateStoreOrderStatusMutation()
  const [refundOrder] = useRefundStoreOrderMutation()
  const today = getLocalDateString()
  const selectedDayRange = getLocalDayRange(selectedDate)
  const storeOpenState = meResponse?.account?.isOpen ?? store?.isOpen ?? true
  const { data: dashboardResponse, error: dashboardError, isLoading: dashboardLoading, refetch: refetchDashboard } = useGetStoreDashboardQuery({ days: 1, ...selectedDayRange }, { skip: !token, pollingInterval: 30000 })
  const { data: productsResponse, error: productsError, isLoading: productsLoading } = useGetStoreProductsQuery({ page: productPage, limit: 100, search: productSearch || undefined }, { skip: !token || tab !== 'inventory' })
  const orderQueryKey = JSON.stringify([
    selectedDate,
    tab === 'orders' ? orderPage : 1,
    tab === 'orders' ? statusFilter : '',
    tab === 'orders' ? debouncedOrderSearch : '',
    tab === 'orders' ? orderSort : 'newest'
  ])
  const { currentData: ordersResponse, error: ordersError, isLoading: ordersLoading, isFetching: ordersFetching } = useGetStoreOrdersQuery({
    page: tab === 'orders' ? orderPage : 1,
    limit: 100,
    from: selectedDayRange.from,
    to: selectedDayRange.to,
    orderStatus: tab === 'orders' ? statusFilter || undefined : undefined,
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
      await task()
      setActionSuccess(successMessage)
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

  async function toggleStatus() {
    await runAction('status', 'toggle', async () => {
      await toggleStoreStatus(!storeOpenState).unwrap()
    }, `Store marked ${!storeOpenState ? 'open' : 'closed'}.`)
  }

  return <div className="min-h-screen bg-[#fbf7f1] text-[#392824]">
    <header className="sticky top-0 z-20 border-b border-[#eadfd7] bg-[#fbf7f1]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/store" className="flex items-center gap-3"><img src="/nallibokka-logo.png" alt="" className="h-9 w-9 object-contain" /><span><span className="block text-sm font-semibold">NalliBokka</span><span className="block text-[10px] text-[#9a8176]">Store dashboard</span></span></Link>
        <div className="flex items-center gap-3"><span className="hidden text-right sm:block"><span className="block text-xs font-semibold">{store?.storeName || meResponse?.store?.storeName || 'Your store'}</span><span className="block text-[10px] text-[#9a8176]">{store?.location || meResponse?.store?.location}</span></span><button onClick={logout} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#eadfd7] px-3 text-xs font-semibold text-[#76534a] hover:bg-[#f8eeea]"><LogOut size={14} /><span className="hidden sm:inline">Sign out</span></button></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 sm:py-7 lg:grid-cols-[210px_1fr]">
      <aside className="lg:sticky lg:top-[82px] lg:h-fit">
        <section className={`mb-3 overflow-hidden rounded-2xl border p-3.5 transition-colors duration-300 ${storeOpenState ? 'border-[#d4e4d5] bg-gradient-to-br from-[#f3f8f1] to-white' : 'border-[#ead0ca] bg-gradient-to-br from-[#fbefec] to-white'}`} aria-label="Store availability">
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${storeOpenState ? 'bg-[#e2f0e2] text-[#427255]' : 'bg-[#f4dfdc] text-[#8b4f49]'}`}>
              <Power size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[.12em] text-[#8a7a71]">Store status</span>
              <span className={`mt-0.5 flex items-center gap-1.5 text-sm font-bold ${storeOpenState ? 'text-[#427255]' : 'text-[#8b4f49]'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${storeOpenState ? 'bg-[#5c9567] motion-safe:animate-pulse' : 'bg-[#b66b61]'}`} />
                {storeOpenState ? 'Open for orders' : 'Not accepting orders'}
              </span>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-[#887a71]">{storeOpenState ? 'Customers can browse your products and place orders.' : 'Customers cannot browse or check out from this store.'}</p>
          <button
            type="button"
            onClick={toggleStatus}
            disabled={pendingAction === 'status-toggle'}
            aria-pressed={storeOpenState}
            className={`mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold transition duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-wait disabled:opacity-60 ${storeOpenState ? 'bg-[#fff] text-[#8b4f49] ring-1 ring-inset ring-[#e6cbc5] hover:bg-[#fcf1ee]' : 'bg-[#427255] text-white hover:bg-[#365e46]'}`}
          >
            <Power size={14} />
            {pendingAction === 'status-toggle' ? 'Updating availability…' : storeOpenState ? 'Pause orders' : 'Resume orders'}
          </button>
        </section>
        <nav className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); setActionError(''); setActionSuccess('') }} className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition lg:w-full ${tab === id ? 'bg-[#861923] text-white shadow-sm' : 'text-[#796a63] hover:bg-[#f4e8e2]'}`}><Icon size={16} />{label}</button>)}</nav>
      </aside>

      <main key={tab} className="min-w-0 dashboard-page-transition">
        {tab !== 'inventory' && tab !== 'reports' && tab !== 'activity' && <DateFilter selectedDate={selectedDate} today={today} onChange={changeSelectedDate} />}
        {(actionError || actionSuccess) && <p role={actionError ? 'alert' : 'status'} className={`mb-4 flex items-center gap-2 rounded-xl p-3 text-sm ${actionError ? 'bg-[#fbefec] text-[#8c4034]' : 'bg-[#eef4ed] text-[#4f7754]'}`}>{actionError ? <AlertCircle size={16} /> : <Check size={16} />}{actionError || actionSuccess}</p>}
        {tab === 'overview' && <>
          <SectionTitle eyebrow={selectedDate === today ? 'Today at a glance' : 'Daily snapshot'} title="Store overview"><button onClick={() => refetchDashboard()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#eadfd7] bg-white px-3 text-xs font-semibold text-[#76534a] transition hover:bg-[#fff8f4]"><RefreshCw size={14} />Refresh</button></SectionTitle>
          {dashboardError && <p role="alert" className="mb-4 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(dashboardError)}</p>}
          {(ordersError || transactionsError) && <p role="alert" className="mb-4 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{ordersError && `Orders: ${getErrorMessage(ordersError)} `}{transactionsError && `Transactions: ${getErrorMessage(transactionsError)}`}</p>}
          {dashboardLoading || ordersLoading || transactionsLoading ? <MeatCuttingLoader label="Preparing your store overview…" compact /> : <div className="dashboard-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={selectedDate === today ? 'Orders today' : 'Orders'} value={periodMetrics?.orders ?? '—'} detail="Placed on the selected day" icon={ClipboardList} />
            <MetricCard label={selectedDate === today ? 'Paid revenue today' : 'Paid revenue'} value={periodMetrics ? formatPrice(periodMetrics.paidRevenue) : '—'} detail={`${periodMetrics?.paidTransactions ?? '—'} paid transactions on this day`} icon={ArrowUpRight} tone="green" />
            <MetricCard label="In stock" value={dashboard?.inventory?.inStock ?? '—'} detail="Active inventory products" icon={Boxes} tone="coral" />
            <MetricCard label="Sold out" value={dashboard?.inventory?.outOfStock ?? '—'} detail="Products needing restock" icon={ArrowDownRight} />
          </div>}
          <section className="mt-5 rounded-[18px] border border-[#eadfd7] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#ad7669]">Daily activity</p><h2 className="mt-1 text-base font-semibold text-[#493631]">Orders for this day</h2></div><button onClick={() => setTab('orders')} className="text-xs font-semibold text-[#861923]">View all orders →</button></div>
            <div className="dashboard-stagger mt-4 space-y-2">{selectedDayOrders.slice(0, 5).map((order) => <div key={order._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fffaf6] p-3 transition duration-200 hover:translate-x-1 hover:bg-[#fbf0eb]"><div><p className="text-xs font-semibold">#{order._id.slice(-8).toUpperCase()} · {typeof order.userId === 'object' ? order.userId?.name : 'Customer'}</p><p className="mt-1 text-[10px] text-[#8b7d76]">{new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {order.orderStatus}</p></div><span className="text-sm font-semibold">{formatPrice(order.totalAmount)}</span></div>)}
              {!selectedDayOrders.length && <p className="rounded-xl bg-[#fffaf6] p-4 text-center text-xs text-[#8b7d76]">No orders on this day.</p>}</div>
            {dashboard?.paidRevenue && <p className="mt-3 text-[10px] text-[#9a8b83]">Revenue overview API reports a rolling period ({dashboard.paidRevenue.sinceDays} day). Daily totals use server aggregates for local midnight boundaries.</p>}
          </section>
        </>}

        {tab === 'orders' && <>
          <SectionTitle eyebrow="Order management" title={selectedDate === today ? 'Live orders' : 'Orders'}>
            <div className="flex flex-wrap items-center gap-2">
              {selectedDate === today && <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#edf5ee] px-3 text-[10px] font-bold uppercase tracking-[.08em] text-[#427255]"><span className="h-1.5 w-1.5 rounded-full bg-[#5c9567] motion-safe:animate-pulse" />Live · 8 sec</span>}
              <label className="flex h-9 items-center gap-2 rounded-lg border border-[#eadfd7] bg-white px-3 text-xs text-[#82736d]"><Clock3 size={14} /><select aria-label="Filter orders by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setOrderPage(1) }} className="bg-transparent outline-none"><option value="">All statuses</option>{['placed', 'packing', 'out for delivery', 'delivered', 'cancelled'].map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className="flex h-9 items-center gap-2 rounded-lg border border-[#eadfd7] bg-white px-3 text-xs text-[#82736d]"><select aria-label="Sort orders" value={orderSort} onChange={(event) => { setOrderSort(event.target.value); setOrderPage(1) }} className="bg-transparent outline-none"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount_desc">Highest total</option><option value="amount_asc">Lowest total</option></select></label>
            </div>
          </SectionTitle>
          <label className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-[#eadfd7] bg-white px-3 text-sm text-[#82736d] transition focus-within:border-[#c98c7f] focus-within:shadow-[0_0_0_3px_rgba(223,118,103,.12)]">
            <Search size={16} className="shrink-0 text-[#ad7669]" />
            <input value={orderSearch} onChange={(event) => { setOrderSearch(event.target.value); setOrderPage(1) }} placeholder="Search order ID, customer name or phone" className="min-w-0 flex-1 bg-transparent text-sm text-[#392824] outline-none placeholder:text-[#aaa098]" />
            {orderSearch && <button type="button" aria-label="Clear order search" onClick={() => { setOrderSearch(''); setOrderPage(1) }} className="grid h-7 w-7 place-items-center rounded-full transition hover:bg-[#f7eee8]"><X size={14} /></button>}
          </label>
          <div className="mb-3 rounded-xl border border-[#eadfd7] bg-[#fffdfa] p-3 text-xs leading-5 text-[#82736d]">New orders are <strong>placed</strong>. Accept moves an order to <strong>packing</strong> (the API requires it to be paid). Decline requests cancellation; the server enforces its payment restrictions.</div>
          {ordersFetching && !ordersLoading && <p role="status" className="mb-3 flex items-center gap-2 text-[10px] font-medium text-[#8a766d]"><span className="h-3 w-3 rounded-full border-2 border-[#eadfd7] border-t-[#861923] motion-safe:animate-spin" />Refreshing orders</p>}
          {ordersError && <p role="alert" className="mb-3 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(ordersError)}</p>}
          {ordersLoading ? <MeatCuttingLoader label="Fetching today’s orders…" compact /> : orders.length ? <div className="space-y-3">{orders.map((order) => {
            const customer = typeof order.userId === 'object' ? order.userId : {}
            const next = order.orderStatus === 'packing' ? 'out for delivery' : order.orderStatus === 'out for delivery' ? 'delivered' : null
            const paymentConfirmed = ['paid', 'refund_failed'].includes(order.paymentStatus)
            const motion = orderMotion[order._id]
            return <article key={order._id} className={`rounded-[18px] border bg-white p-4 transition-all duration-500 sm:p-5 ${motion === 'new' ? 'order-live-new border-[#d9aaa0] shadow-[0_14px_42px_-24px_rgba(134,25,35,.55)]' : motion === 'updated' ? 'order-live-updated border-[#d7e6d8]' : 'border-[#eadfd7]'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#ad7669]">Order #{order._id.slice(-8).toUpperCase()}</p>{motion && <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] ${motion === 'new' ? 'bg-[#fbefec] text-[#9b5148]' : 'bg-[#edf5ee] text-[#427255]'}`}>{motion === 'new' ? 'New order' : 'Just updated'}</span>}</div><h3 className="mt-1 text-sm font-semibold text-[#493631]">{customer.name || 'Customer'} <span className="font-normal text-[#8b7d76]">{customer.phone || ''}</span></h3><p className="mt-1 text-[10px] text-[#8b7d76]">{new Date(order.createdAt).toLocaleString('en-IN')}</p></div><div className="text-right"><p className="text-base font-semibold">{formatPrice(order.totalAmount)}</p><p className="mt-1 text-[10px] capitalize text-[#8b7d76]">Payment: {order.paymentStatus}</p></div></div>
              <div className={`mt-3 space-y-1 border-t border-[#f1e9e4] pt-3 ${motion ? 'order-items-highlight' : ''}`}>{order.items?.map((item, index) => <p key={`${item.productId}-${index}`} className={`rounded-lg px-2 py-1 text-xs text-[#64554e] transition-colors ${motion ? 'bg-[#fff5ed] text-[#714336]' : ''}`}><span className="font-semibold">{item.productName}</span> · {item.quantity} {item.selectionType === 'weight' ? 'kg' : item.selectionType === 'pieces' ? 'pieces' : item.packLabel}</p>)}</div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${order.orderStatus === 'placed' ? 'bg-[#fbefec] text-[#9b5148]' : order.orderStatus === 'delivered' ? 'bg-[#eef4ed] text-[#4f7754]' : 'bg-[#f5eee8] text-[#87634f]'}`}>{order.orderStatus}</span><div className="flex flex-wrap gap-2">
                {order.orderStatus === 'placed' && <><button disabled={!paymentConfirmed || pendingAction === `${order._id}-packing`} title={!paymentConfirmed ? 'The API allows accepting an order only after payment is confirmed.' : undefined} onClick={() => changeOrderStatus(order, 'packing')} className="h-9 rounded-lg bg-[#861923] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{pendingAction === `${order._id}-packing` ? 'Accepting…' : paymentConfirmed ? 'Accept order' : 'Awaiting payment'}</button><button disabled={pendingAction === `${order._id}-cancelled`} onClick={() => changeOrderStatus(order, 'cancelled')} className="h-9 rounded-lg border border-[#eadfd7] px-3 text-xs font-semibold text-[#76534a] disabled:opacity-55">Decline</button></>}
                {['placed', 'packing'].includes(order.orderStatus) && order.paymentStatus === 'paid' && <button disabled={pendingAction === `${order._id}-refund`} onClick={() => requestOrderRefund(order)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-55"><RotateCcw size={13} />{pendingAction === `${order._id}-refund` ? 'Requesting…' : 'Full refund'}</button>}
                {next && <button disabled={pendingAction === `${order._id}-${next}`} onClick={() => changeOrderStatus(order, next)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#861923] px-3 text-xs font-semibold text-white disabled:opacity-55">{next === 'delivered' ? <Check size={14} /> : <Truck size={14} />}{pendingAction === `${order._id}-${next}` ? 'Updating…' : next === 'delivered' ? 'Mark delivered' : 'Out for delivery'}</button>}
              </div></div>
            </article>
          })}</div> : <div className="rounded-[18px] border border-[#eadfd7] bg-white p-10 text-center"><ClipboardList className="mx-auto text-[#c0988e]" size={26} /><h3 className="mt-3 text-sm font-semibold">{debouncedOrderSearch ? 'No matching orders' : 'No orders on this day'}</h3><p className="mt-1 text-xs text-[#8b7d76]">{debouncedOrderSearch ? 'Try a different order ID, customer name, or phone number.' : 'Orders placed on the selected day will show up here.'}</p></div>}
          {!ordersLoading && <PaginationControls pagination={ordersResponse?.pagination} page={orderPage} onPageChange={setOrderPage} />}
        </>}

        {tab === 'inventory' && <>
          <SectionTitle eyebrow="Your catalog" title="Inventory"><button onClick={() => { setEditingProduct(null); setShowProductForm((value) => !value) }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#861923] px-3 text-xs font-semibold text-white hover:bg-[#70131c]"><PackagePlus size={15} />Add product</button></SectionTitle>
          {showProductForm && <ProductForm key={editingProduct?._id || 'new-product'} product={editingProduct} onCancel={() => { setShowProductForm(false); setEditingProduct(null) }} onSaved={() => { setShowProductForm(false); setEditingProduct(null); setActionSuccess(editingProduct ? 'Product changes saved.' : 'Product added to inventory.') }} />}
          <label className="mb-3 flex h-10 items-center gap-2 rounded-lg border border-[#eadfd7] bg-white px-3 text-xs text-[#82736d]"><Boxes size={14} /><input value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setProductPage(1) }} placeholder="Search products" className="w-full bg-transparent text-sm text-[#392824] outline-none" /></label>
          {productsError && <p role="alert" className="mb-3 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(productsError)}</p>}
          {productsLoading ? <MeatCuttingLoader label="Preparing your inventory…" compact /> : products.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{products.map((product) => <article key={product._id} className="overflow-hidden rounded-[16px] border border-[#eadfd7] bg-white">
            <div className="flex gap-3 p-3"><img src={product.imageUrl} alt="" className="h-16 w-16 rounded-xl bg-[#f5eee8] object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.productName}</p><p className="mt-1 text-[10px] capitalize text-[#8b7d76]">{product.productType}</p><p className="mt-1 text-xs font-semibold text-[#76534a]">{product.packs?.length ? product.packs.map(({ label, price }) => `${label} ${formatPrice(price)}`).join(' · ') : `${formatPrice(product.pricePerKg)} / kg`}</p></div></div>
            <div className="flex items-center justify-between border-t border-[#f1e9e4] px-3 py-2.5"><button onClick={() => runAction(product._id, 'stock', () => setStock({ productId: product._id, inStock: !product.inStock }).unwrap())} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${product.inStock ? 'bg-[#eef4ed] text-[#4f7754]' : 'bg-[#fbefec] text-[#9b5148]'}`}>{product.inStock ? 'In stock' : 'Sold out'} · toggle</button><div className="flex items-center"><button onClick={() => { setEditingProduct(product); setShowProductForm(true); setActionError(''); setActionSuccess('') }} aria-label={`Edit ${product.productName}`} className="rounded-lg px-2 py-1.5 text-[10px] font-semibold text-[#861923] hover:bg-[#fbefec]">Edit</button><button onClick={() => { if (window.confirm(`Delete ${product.productName} from inventory?`)) runAction(product._id, 'delete', () => deleteProduct(product._id).unwrap()) }} aria-label={`Delete ${product.productName}`} className="rounded-lg p-2 text-[#9b8178] hover:bg-[#fbefec] hover:text-[#861923]"><Trash2 size={15} /></button></div></div>
          </article>)}</div> : <div className="rounded-[18px] border border-[#eadfd7] bg-white p-10 text-center"><Boxes className="mx-auto text-[#c0988e]" size={26} /><h3 className="mt-3 text-sm font-semibold">No products found</h3><p className="mt-1 text-xs text-[#8b7d76]">Add your first product or adjust search.</p></div>}
          {!productsLoading && <PaginationControls pagination={productsResponse?.pagination} page={productPage} onPageChange={setProductPage} />}
        </>}

        {tab === 'transactions' && <>
          <SectionTitle eyebrow="Payments" title={selectedDate === today ? 'Transactions today' : 'Transactions'}><span className="text-xs text-[#8b7d76]">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span></SectionTitle>
          {transactionsError && <p role="alert" className="mb-3 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(transactionsError)}</p>}
          {transactionsLoading ? <MeatCuttingLoader label="Loading transactions…" compact /> : <>
            <div className="dashboard-stagger mb-3 grid gap-3 sm:grid-cols-3"><MetricCard label={selectedDate === today ? 'Paid today' : 'Paid revenue'} value={periodMetrics ? formatPrice(periodMetrics.paidRevenue) : '—'} detail={`${periodMetrics?.paidTransactions ?? '—'} captured payments on this day`} icon={ArrowUpRight} tone="green" /><MetricCard label={selectedDate === today ? 'Transactions today' : 'Transactions'} value={periodMetrics ? Object.values(periodMetrics.transactions).reduce((sum, count) => sum + count, 0) : '—'} detail="All payment statuses" icon={CreditCard} /><MetricCard label={selectedDate === today ? 'Failed today' : 'Failed transactions'} value={periodMetrics?.transactions?.failed ?? '—'} detail="Payment attempts" icon={ArrowDownRight} tone="coral" /></div>
            {selectedDayTransactions.length ? <div className="dashboard-stagger overflow-hidden rounded-[18px] border border-[#eadfd7] bg-white"><div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 border-b border-[#f1e9e4] bg-[#fffdfa] px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#927f74] sm:grid"><span>Order</span><span>Time</span><span>Status</span><span className="text-right">Amount</span></div>{selectedDayTransactions.map((transaction) => <div key={transaction._id} className="grid gap-1 border-b border-[#f4eeea] px-4 py-3 last:border-0 transition-colors hover:bg-[#fffaf6] sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center sm:gap-3"><span className="text-xs font-semibold">#{String(transaction.orderId?._id || transaction.orderId).slice(-8).toUpperCase()}</span><span className="text-[11px] text-[#82736d]">{new Date(transaction.timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span><span className={`w-fit rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${transaction.refundStatus === 'pending' || transaction.refundStatus === 'failed' ? 'bg-[#fbefec] text-[#9b5148]' : transaction.refundStatus === 'processed' ? 'bg-[#eef4ed] text-[#4f7754]' : transaction.status === 'paid' ? 'bg-[#eef4ed] text-[#4f7754]' : transaction.status === 'failed' ? 'bg-[#fbefec] text-[#9b5148]' : 'bg-[#f5eee8] text-[#87634f]'}`}>{transaction.refundStatus && transaction.refundStatus !== 'none' ? `refund ${transaction.refundStatus}` : transaction.status}</span><span className="text-xs font-semibold sm:text-right">{formatPrice(transaction.amount)}</span></div>)}</div> : <div className="rounded-[18px] border border-[#eadfd7] bg-white p-10 text-center"><CreditCard className="mx-auto text-[#c0988e]" size={26} /><h3 className="mt-3 text-sm font-semibold">No transactions on this day</h3><p className="mt-1 text-xs text-[#8b7d76]">Payment activity for the selected day will appear here.</p></div>}
          </>}
          {!transactionsLoading && <PaginationControls pagination={transactionsResponse?.pagination} page={transactionPage} onPageChange={setTransactionPage} />}
        </>}

        {tab === 'activity' && <>
          <SectionTitle eyebrow="Store history" title="Activity log" />
          <p className="mb-4 rounded-xl border border-[#eadfd7] bg-white p-3 text-xs leading-5 text-[#82736d]">Recent operational changes made by this store account. Audit entries are retained for one year and do not include customer contact or address details.</p>
          {auditError && <p role="alert" className="mb-3 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(auditError)}</p>}
          {auditLoading ? <MeatCuttingLoader label="Loading activity…" compact /> : auditEvents.length ? <div className="space-y-2">
            {auditEvents.map((event) => <article key={event._id} className="rounded-[16px] border border-[#eadfd7] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-sm font-semibold text-[#493631]">{event.action.replaceAll('.', ' ').replaceAll('_', ' ')}</p><p className="mt-1 text-xs capitalize text-[#82736d]">{event.entityType} · {event.entityId.slice(-8).toUpperCase()}</p></div>
                <time className="text-[11px] text-[#9a8b83]" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('en-IN')}</time>
              </div>
              {(event.previousState || event.nextState) && <p className="mt-2 text-xs text-[#64554e]">Changed from <strong>{event.previousState || '—'}</strong> to <strong>{event.nextState || '—'}</strong></p>}
              {event.changedFields?.length > 0 && <p className="mt-1 text-[11px] text-[#82736d]">Fields: {event.changedFields.join(', ')}</p>}
              {event.requestId && <p className="mt-2 break-all font-mono text-[10px] text-[#a0928a]">Request {event.requestId}</p>}
            </article>)}
          </div> : !auditError && <div className="rounded-[18px] border border-[#eadfd7] bg-white p-10 text-center"><Activity className="mx-auto text-[#c0988e]" size={26} /><h3 className="mt-3 text-sm font-semibold">No activity recorded yet</h3><p className="mt-1 text-xs text-[#8b7d76]">Store changes will appear here.</p></div>}
          <PaginationControls pagination={auditResponse?.pagination} page={auditPage} onPageChange={setAuditPage} />
        </>}

        {tab === 'reports' && <>
          <SectionTitle eyebrow="Exports" title="Reports & exports" />
          <section className="dashboard-enter mb-5 rounded-[20px] border border-[#eadfd7] bg-white p-5 shadow-[0_16px_42px_-32px_rgba(91,43,33,.55)] sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fbefec] text-[#9b5148]"><CalendarDays size={20} /></span>
              <div><h2 className="text-sm font-semibold text-[#493631]">Choose a date range</h2><p className="mt-1 text-xs leading-5 text-[#82736d]">Reports include activity from the start of the first day through the end of the last day, in your local timezone.</p></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <label className="text-xs font-semibold text-[#76534a]">FROM
                <input type="date" value={reportFrom} max={today} onChange={(event) => setReportFrom(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#eadfd7] bg-[#fffdfa] px-3 text-sm font-medium text-[#493631] outline-none focus:border-[#c98c7f]" />
              </label>
              <span className="hidden pb-3 text-xs text-[#ad7669] sm:block">through</span>
              <label className="text-xs font-semibold text-[#76534a]">TO
                <input type="date" value={reportTo} min={reportFrom} max={today} onChange={(event) => setReportTo(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-[#eadfd7] bg-[#fffdfa] px-3 text-sm font-medium text-[#493631] outline-none focus:border-[#c98c7f]" />
              </label>
            </div>
            {reportTo < reportFrom && <p role="alert" className="mt-3 text-xs text-rose-700">The end date must be the same as or later than the start date.</p>}
          </section>
          <div className="dashboard-stagger grid gap-4 md:grid-cols-2">
            {[
              { type: 'orders', title: 'Orders report', description: 'Order dates, fulfillment and payment statuses, totals, and item summaries.' },
              { type: 'transactions', title: 'Payments report', description: 'Payment and refund activity, transaction amounts, and provider references.' },
            ].map(({ type, title, description }) => (
              <article key={type} className="rounded-[20px] border border-[#eadfd7] bg-white p-5 transition duration-300 hover:-translate-y-1 hover:border-[#d9aaa0] hover:shadow-[0_18px_42px_-28px_rgba(91,43,33,.4)] sm:p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f5eee8] text-[#87634f]"><Download size={18} /></span>
                <h2 className="mt-4 text-base font-semibold text-[#493631]">{title}</h2>
                <p className="mt-1 min-h-10 text-xs leading-5 text-[#82736d]">{description}</p>
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
                  className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#861923] px-4 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#70131c] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Download size={14} />{exportingReport === type ? 'Preparing CSV…' : `Download ${type} CSV`}
                </button>
              </article>
            ))}
          </div>
          <p className="mt-4 rounded-xl border border-[#e7d5cc] bg-[#fff9f6] p-3 text-xs leading-5 text-[#7e6d65]">Exports are scoped to your store. Customer phone numbers and delivery addresses are not included.</p>
        </>}

        {dashboardError && tab !== 'overview' && !dashboard && <p role="alert" className="mt-4 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(dashboardError)}</p>}
      </main>
    </div>
  </div>
}
