import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Boxes, Check, ClipboardList, Clock3,
  CreditCard, LayoutDashboard, LogOut, PackagePlus, RefreshCw, Trash2, Truck,
} from 'lucide-react'
import {
  useCreateStoreProductMutation, useDeleteStoreProductMutation, useGetStoreDashboardQuery,
  useGetStoreMeQuery, useGetStoreOrdersQuery, useGetStoreProductsQuery,
  useGetStoreTransactionsQuery, useSetStoreProductStockMutation, useUpdateStoreOrderStatusMutation,
  useUpdateStoreProductMutation,
} from '../../api/api.js'
import { api } from '../../api/api.js'
import { getErrorMessage, formatPrice } from '../../customer/utils.js'
import { storeSignedOut } from '../storeAuthSlice.js'

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'transactions', label: 'Transactions', icon: CreditCard },
]
const productTypes = ['meat', 'vegetable', 'fruit', 'oil', 'rice']
const isToday = (value) => {
  if (!value) return false
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + 1)
  const timestamp = new Date(value)
  return timestamp >= date && timestamp < nextDate
}
const getData = (response) => response?.data || []

function MetricCard({ label, value, detail, icon: Icon, tone = 'wine' }) {
  const colors = tone === 'green'
    ? 'bg-[#eef4ed] text-[#4f7754]'
    : tone === 'coral'
      ? 'bg-[#fbefec] text-[#a55549]'
      : 'bg-[#f5eee8] text-[#87634f]'
  return <article className="rounded-[18px] border border-[#eadfd7] bg-white p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-[#82736d]">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-.04em] text-[#392824]">{value}</p><p className="mt-1 text-[11px] text-[#9a8b83]">{detail}</p></div><span className={`grid h-10 w-10 place-items-center rounded-xl ${colors}`}><Icon size={18} /></span></div>
  </article>
}

function SectionTitle({ eyebrow, title, children }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#ad7669]">{eyebrow}</p><h1 className="mt-1 font-display text-2xl font-medium tracking-[-.03em] text-[#392824] sm:text-[28px]">{title}</h1></div>{children}</div>
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
  const [statusFilter, setStatusFilter] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [pendingAction, setPendingAction] = useState('')
  const [setStock] = useSetStoreProductStockMutation()
  const [deleteProduct] = useDeleteStoreProductMutation()
  const [updateOrder] = useUpdateStoreOrderStatusMutation()
  const { data: dashboardResponse, error: dashboardError, isLoading: dashboardLoading, refetch: refetchDashboard } = useGetStoreDashboardQuery({ days: 1 }, { skip: !token, pollingInterval: 30000 })
  const { data: productsResponse, error: productsError, isLoading: productsLoading } = useGetStoreProductsQuery({ page: 1, limit: 100, search: productSearch || undefined }, { skip: !token || tab !== 'inventory' })
  const { data: ordersResponse, error: ordersError, isLoading: ordersLoading } = useGetStoreOrdersQuery({ page: 1, limit: 100 }, { skip: !token, pollingInterval: token ? 15000 : 0 })
  const { data: transactionsResponse, error: transactionsError, isLoading: transactionsLoading } = useGetStoreTransactionsQuery({ page: 1, limit: 100 }, { skip: !token, pollingInterval: token ? 30000 : 0 })
  const dashboard = dashboardResponse?.data
  const products = getData(productsResponse)
  const allOrders = getData(ordersResponse)
  const orders = useMemo(() => statusFilter ? allOrders.filter((order) => order.orderStatus === statusFilter) : allOrders, [allOrders, statusFilter])
  const transactions = getData(transactionsResponse)
  const todaysOrders = useMemo(() => allOrders.filter((order) => isToday(order.createdAt)), [allOrders])
  const todaysTransactions = useMemo(() => transactions.filter((transaction) => isToday(transaction.timestamp)), [transactions])
  const todaysPaid = todaysTransactions.filter((transaction) => transaction.status === 'paid')
  const todayRevenue = todaysPaid.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)

  useEffect(() => {
    if (token && (meError?.status === 401 || meError?.status === 403 || (meResponse?.role && meResponse.role !== 'store'))) {
      dispatch(storeSignedOut())
      dispatch(api.util.resetApiState())
    }
  }, [dispatch, meError, meResponse, token])

  if (!token) return <Navigate to="/store/login" replace />
  if (meError?.status === 401 || meError?.status === 403 || (meResponse?.role && meResponse.role !== 'store')) return <Navigate to="/store/login" replace />

  async function runAction(id, action, task) {
    setActionError('')
    setActionSuccess('')
    setPendingAction(`${id}-${action}`)
    try {
      await task()
      setActionSuccess('Changes saved.')
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

  function logout() {
    dispatch(storeSignedOut())
    dispatch(api.util.resetApiState())
  }

  const todayOrdersView = (list) => list.filter((order) => isToday(order.createdAt))

  return <div className="min-h-screen bg-[#fbf7f1] text-[#392824]">
    <header className="sticky top-0 z-20 border-b border-[#eadfd7] bg-[#fbf7f1]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/store" className="flex items-center gap-3"><img src="/nallibokka-logo.png" alt="" className="h-9 w-9 object-contain" /><span><span className="block text-sm font-semibold">NalliBokka</span><span className="block text-[10px] text-[#9a8176]">Store dashboard</span></span></Link>
        <div className="flex items-center gap-3"><span className="hidden text-right sm:block"><span className="block text-xs font-semibold">{store?.storeName || meResponse?.store?.storeName || 'Your store'}</span><span className="block text-[10px] text-[#9a8176]">{store?.location || meResponse?.store?.location}</span></span><button onClick={logout} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#eadfd7] px-3 text-xs font-semibold text-[#76534a] hover:bg-[#f8eeea]"><LogOut size={14} /><span className="hidden sm:inline">Sign out</span></button></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 sm:py-7 lg:grid-cols-[210px_1fr]">
      <aside className="lg:sticky lg:top-[82px] lg:h-fit">
        <div className="mb-3 rounded-2xl border border-[#e7d5cc] bg-[#fbf0eb] p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#493631]">Store status</span><span className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-semibold text-[#987b70]">API unavailable</span></div>
          <button type="button" disabled title="The store API does not currently provide an open/close control." className="mt-2 h-9 w-full cursor-not-allowed rounded-lg bg-[#d9d2cc] text-xs font-semibold text-[#72665f]">Open / close unavailable</button>
        </div>
        <nav className="no-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">{navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setTab(id); setActionError(''); setActionSuccess('') }} className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition lg:w-full ${tab === id ? 'bg-[#861923] text-white shadow-sm' : 'text-[#796a63] hover:bg-[#f4e8e2]'}`}><Icon size={16} />{label}</button>)}</nav>
      </aside>

      <main className="min-w-0">
        {(actionError || actionSuccess) && <p role={actionError ? 'alert' : 'status'} className={`mb-4 flex items-center gap-2 rounded-xl p-3 text-sm ${actionError ? 'bg-[#fbefec] text-[#8c4034]' : 'bg-[#eef4ed] text-[#4f7754]'}`}>{actionError ? <AlertCircle size={16} /> : <Check size={16} />}{actionError || actionSuccess}</p>}
        {tab === 'overview' && <>
          <SectionTitle eyebrow="Today at a glance" title="Store overview"><button onClick={() => refetchDashboard()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#eadfd7] bg-white px-3 text-xs font-semibold text-[#76534a]"><RefreshCw size={14} />Refresh</button></SectionTitle>
          {dashboardError && <p role="alert" className="mb-4 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(dashboardError)}</p>}
          {(ordersError || transactionsError) && <p role="alert" className="mb-4 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{ordersError && `Orders: ${getErrorMessage(ordersError)} `}{transactionsError && `Transactions: ${getErrorMessage(transactionsError)}`}</p>}
          {dashboardLoading || ordersLoading || transactionsLoading ? <p className="rounded-xl bg-white p-6 text-sm text-[#82736d]">Loading store overview…</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Orders today" value={todaysOrders.length} detail="Placed since local midnight" icon={ClipboardList} />
            <MetricCard label="Paid revenue today" value={formatPrice(todayRevenue)} detail={`${todaysPaid.length} paid transactions today`} icon={ArrowUpRight} tone="green" />
            <MetricCard label="In stock" value={dashboard?.inventory?.inStock ?? '—'} detail="Active inventory products" icon={Boxes} tone="coral" />
            <MetricCard label="Sold out" value={dashboard?.inventory?.outOfStock ?? '—'} detail="Products needing restock" icon={ArrowDownRight} />
          </div>}
          <section className="mt-5 rounded-[18px] border border-[#eadfd7] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#ad7669]">Live queue</p><h2 className="mt-1 text-base font-semibold text-[#493631]">Orders to prepare</h2></div><button onClick={() => setTab('orders')} className="text-xs font-semibold text-[#861923]">Manage orders →</button></div>
            <div className="mt-4 space-y-2">{todaysOrders.slice(0, 5).map((order) => <div key={order._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#fffaf6] p-3"><div><p className="text-xs font-semibold">#{order._id.slice(-8).toUpperCase()} · {typeof order.userId === 'object' ? order.userId?.name : 'Customer'}</p><p className="mt-1 text-[10px] text-[#8b7d76]">{new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {order.orderStatus}</p></div><span className="text-sm font-semibold">{formatPrice(order.totalAmount)}</span></div>)}
              {!todaysOrders.length && <p className="rounded-xl bg-[#fffaf6] p-4 text-center text-xs text-[#8b7d76]">No new orders today yet.</p>}</div>
            {dashboard?.paidRevenue && <p className="mt-3 text-[10px] text-[#9a8b83]">Revenue overview API reports a rolling period ({dashboard.paidRevenue.sinceDays} day). Daily revenue above uses paid transactions from local midnight.</p>}
          </section>
        </>}

        {tab === 'orders' && <>
          <SectionTitle eyebrow="Order management" title="Live orders"><label className="flex h-9 items-center gap-2 rounded-lg border border-[#eadfd7] bg-white px-3 text-xs text-[#82736d]"><Clock3 size={14} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="bg-transparent outline-none"><option value="">All statuses</option>{['placed', 'packing', 'out for delivery', 'delivered', 'cancelled'].map((status) => <option key={status}>{status}</option>)}</select></label></SectionTitle>
          <div className="mb-3 rounded-xl border border-[#eadfd7] bg-[#fffdfa] p-3 text-xs leading-5 text-[#82736d]">New orders are <strong>placed</strong>. Accept moves an order to <strong>packing</strong> (the API requires it to be paid). Decline requests cancellation; the server enforces its payment restrictions.</div>
          {ordersError && <p role="alert" className="mb-3 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(ordersError)}</p>}
          {ordersLoading ? <p className="rounded-xl bg-white p-6 text-sm text-[#82736d]">Loading orders…</p> : todayOrdersView(orders).length ? <div className="space-y-3">{todayOrdersView(orders).map((order) => {
            const customer = typeof order.userId === 'object' ? order.userId : {}
            const next = order.orderStatus === 'packing' ? 'out for delivery' : order.orderStatus === 'out for delivery' ? 'delivered' : null
            return <article key={order._id} className="rounded-[18px] border border-[#eadfd7] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#ad7669]">Order #{order._id.slice(-8).toUpperCase()}</p><h3 className="mt-1 text-sm font-semibold text-[#493631]">{customer.name || 'Customer'} <span className="font-normal text-[#8b7d76]">{customer.phone || ''}</span></h3><p className="mt-1 text-[10px] text-[#8b7d76]">{new Date(order.createdAt).toLocaleString('en-IN')}</p></div><div className="text-right"><p className="text-base font-semibold">{formatPrice(order.totalAmount)}</p><p className="mt-1 text-[10px] capitalize text-[#8b7d76]">Payment: {order.paymentStatus}</p></div></div>
              <div className="mt-3 space-y-1 border-t border-[#f1e9e4] pt-3">{order.items?.map((item, index) => <p key={`${item.productId}-${index}`} className="text-xs text-[#64554e]">{item.productName} · {item.quantity} {item.selectionType === 'weight' ? 'kg' : item.selectionType === 'pieces' ? 'pieces' : item.packLabel}</p>)}</div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${order.orderStatus === 'placed' ? 'bg-[#fbefec] text-[#9b5148]' : order.orderStatus === 'delivered' ? 'bg-[#eef4ed] text-[#4f7754]' : 'bg-[#f5eee8] text-[#87634f]'}`}>{order.orderStatus}</span><div className="flex flex-wrap gap-2">
                {order.orderStatus === 'placed' && <><button disabled={order.paymentStatus !== 'paid' || pendingAction === `${order._id}-packing`} title={order.paymentStatus !== 'paid' ? 'The API allows accepting an order only after it is paid.' : undefined} onClick={() => changeOrderStatus(order, 'packing')} className="h-9 rounded-lg bg-[#861923] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{pendingAction === `${order._id}-packing` ? 'Accepting…' : order.paymentStatus === 'paid' ? 'Accept order' : 'Awaiting payment'}</button><button disabled={pendingAction === `${order._id}-cancelled`} onClick={() => changeOrderStatus(order, 'cancelled')} className="h-9 rounded-lg border border-[#eadfd7] px-3 text-xs font-semibold text-[#76534a] disabled:opacity-55">Decline</button></>}
                {next && <button disabled={pendingAction === `${order._id}-${next}`} onClick={() => changeOrderStatus(order, next)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#861923] px-3 text-xs font-semibold text-white disabled:opacity-55">{next === 'delivered' ? <Check size={14} /> : <Truck size={14} />}{pendingAction === `${order._id}-${next}` ? 'Updating…' : next === 'delivered' ? 'Mark delivered' : 'Out for delivery'}</button>}
              </div></div>
            </article>
          })}</div> : <div className="rounded-[18px] border border-[#eadfd7] bg-white p-10 text-center"><ClipboardList className="mx-auto text-[#c0988e]" size={26} /><h3 className="mt-3 text-sm font-semibold">No orders today</h3><p className="mt-1 text-xs text-[#8b7d76]">Orders placed today will show up here.</p></div>}
        </>}

        {tab === 'inventory' && <>
          <SectionTitle eyebrow="Your catalog" title="Inventory"><button onClick={() => { setEditingProduct(null); setShowProductForm((value) => !value) }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#861923] px-3 text-xs font-semibold text-white hover:bg-[#70131c]"><PackagePlus size={15} />Add product</button></SectionTitle>
          {showProductForm && <ProductForm key={editingProduct?._id || 'new-product'} product={editingProduct} onCancel={() => { setShowProductForm(false); setEditingProduct(null) }} onSaved={() => { setShowProductForm(false); setEditingProduct(null); setActionSuccess(editingProduct ? 'Product changes saved.' : 'Product added to inventory.') }} />}
          <label className="mb-3 flex h-10 items-center gap-2 rounded-lg border border-[#eadfd7] bg-white px-3 text-xs text-[#82736d]"><Boxes size={14} /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products" className="w-full bg-transparent text-sm text-[#392824] outline-none" /></label>
          {productsError && <p role="alert" className="mb-3 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(productsError)}</p>}
          {productsLoading ? <p className="rounded-xl bg-white p-6 text-sm text-[#82736d]">Loading inventory…</p> : products.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{products.map((product) => <article key={product._id} className="overflow-hidden rounded-[16px] border border-[#eadfd7] bg-white">
            <div className="flex gap-3 p-3"><img src={product.imageUrl} alt="" className="h-16 w-16 rounded-xl bg-[#f5eee8] object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.productName}</p><p className="mt-1 text-[10px] capitalize text-[#8b7d76]">{product.productType}</p><p className="mt-1 text-xs font-semibold text-[#76534a]">{product.packs?.length ? product.packs.map(({ label, price }) => `${label} ${formatPrice(price)}`).join(' · ') : `${formatPrice(product.pricePerKg)} / kg`}</p></div></div>
            <div className="flex items-center justify-between border-t border-[#f1e9e4] px-3 py-2.5"><button onClick={() => runAction(product._id, 'stock', () => setStock({ productId: product._id, inStock: !product.inStock }).unwrap())} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${product.inStock ? 'bg-[#eef4ed] text-[#4f7754]' : 'bg-[#fbefec] text-[#9b5148]'}`}>{product.inStock ? 'In stock' : 'Sold out'} · toggle</button><div className="flex items-center"><button onClick={() => { setEditingProduct(product); setShowProductForm(true); setActionError(''); setActionSuccess('') }} aria-label={`Edit ${product.productName}`} className="rounded-lg px-2 py-1.5 text-[10px] font-semibold text-[#861923] hover:bg-[#fbefec]">Edit</button><button onClick={() => { if (window.confirm(`Delete ${product.productName} from inventory?`)) runAction(product._id, 'delete', () => deleteProduct(product._id).unwrap()) }} aria-label={`Delete ${product.productName}`} className="rounded-lg p-2 text-[#9b8178] hover:bg-[#fbefec] hover:text-[#861923]"><Trash2 size={15} /></button></div></div>
          </article>)}</div> : <div className="rounded-[18px] border border-[#eadfd7] bg-white p-10 text-center"><Boxes className="mx-auto text-[#c0988e]" size={26} /><h3 className="mt-3 text-sm font-semibold">No products found</h3><p className="mt-1 text-xs text-[#8b7d76]">Add your first product or adjust search.</p></div>}
        </>}

        {tab === 'transactions' && <>
          <SectionTitle eyebrow="Payments" title="Transactions"><span className="text-xs text-[#8b7d76]">Today · {new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span></SectionTitle>
          {transactionsError && <p role="alert" className="mb-3 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(transactionsError)}</p>}
          {transactionsLoading ? <p className="rounded-xl bg-white p-6 text-sm text-[#82736d]">Loading transactions…</p> : todaysTransactions.length ? <>
            <div className="mb-3 grid gap-3 sm:grid-cols-3"><MetricCard label="Paid today" value={formatPrice(todayRevenue)} detail={`${todaysPaid.length} captured payments`} icon={ArrowUpRight} tone="green" /><MetricCard label="Transactions today" value={todaysTransactions.length} detail="All payment statuses" icon={CreditCard} /><MetricCard label="Failed today" value={todaysTransactions.filter((transaction) => transaction.status === 'failed').length} detail="Payment attempts" icon={ArrowDownRight} tone="coral" /></div>
            <div className="overflow-hidden rounded-[18px] border border-[#eadfd7] bg-white"><div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 border-b border-[#f1e9e4] bg-[#fffdfa] px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[#927f74] sm:grid"><span>Order</span><span>Time</span><span>Status</span><span className="text-right">Amount</span></div>{todaysTransactions.map((transaction) => <div key={transaction._id} className="grid gap-1 border-b border-[#f4eeea] px-4 py-3 last:border-0 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center sm:gap-3"><span className="text-xs font-semibold">#{String(transaction.orderId?._id || transaction.orderId).slice(-8).toUpperCase()}</span><span className="text-[11px] text-[#82736d]">{new Date(transaction.timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span><span className={`w-fit rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${transaction.status === 'paid' ? 'bg-[#eef4ed] text-[#4f7754]' : transaction.status === 'failed' ? 'bg-[#fbefec] text-[#9b5148]' : 'bg-[#f5eee8] text-[#87634f]'}`}>{transaction.status}</span><span className="text-xs font-semibold sm:text-right">{formatPrice(transaction.amount)}</span></div>)}</div>
          </> : <div className="rounded-[18px] border border-[#eadfd7] bg-white p-10 text-center"><CreditCard className="mx-auto text-[#c0988e]" size={26} /><h3 className="mt-3 text-sm font-semibold">No transactions today</h3><p className="mt-1 text-xs text-[#8b7d76]">Today’s payment activity will appear here.</p></div>}
        </>}

        {dashboardError && tab !== 'overview' && !dashboard && <p role="alert" className="mt-4 rounded-xl bg-[#fbefec] p-3 text-sm text-[#8c4034]">{getErrorMessage(dashboardError)}</p>}
      </main>
    </div>
  </div>
}
