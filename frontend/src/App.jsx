import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Grid2X2, House, PackageCheck, ShoppingBasket, UserRound } from 'lucide-react'
import { removeGuestItem } from './features/cart/cartSlice.js'
import { setSelectedStore } from './features/store/storeSlice.js'
import { api, useAddCartItemMutation, useGetCartQuery, useGetMeQuery, useGetOrdersQuery, useGetStoresQuery, useGetUserNotificationsQuery } from './features/api/api.js'
import { clearSessionNotice, setSessionNotice, signedOut } from './features/auth/authSlice.js'
import Header from './features/customer/components/Header.jsx'
import StorePicker from './features/customer/components/StorePicker.jsx'
import LoginDialog from './features/customer/components/LoginDialog.jsx'
import CartDrawer from './features/customer/components/CartDrawer.jsx'
import Toast from './features/customer/components/Toast.jsx'
import HomePage from './features/customer/pages/HomePage.jsx'
import ActiveOrderBanner from './features/customer/components/ActiveOrderBanner.jsx'
import PwaInstallPrompt from './features/customer/components/PwaInstallPrompt.jsx'
import { createUuid, getErrorMessage } from './features/customer/utils.js'

const CheckoutPage = lazy(() => import('./features/customer/pages/CheckoutPage.jsx'))
const ProfilePage = lazy(() => import('./features/customer/pages/ProfilePage.jsx'))
const OrdersPage = lazy(() => import('./features/customer/pages/OrdersPage.jsx'))
const CategoriesPage = lazy(() => import('./features/customer/pages/CategoriesPage.jsx'))
const StoreLoginPage = lazy(() => import('./features/storeAdmin/pages/StoreLoginPage.jsx'))
const StoreDashboardPage = lazy(() => import('./features/storeAdmin/pages/StoreDashboardPage.jsx'))

function App() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const isStoreRoute = location.pathname.startsWith('/store')
  const token = useSelector((state) => state.auth.token)
  const guestItems = useSelector((state) => state.cart.guestItems)
  const selectedStore = useSelector((state) => state.selectedStore)
  const sessionNotice = useSelector((state) => state.auth.sessionNotice)
  const [storeOpen, setStoreOpen] = useState(!selectedStore)
  const [loginOpen, setLoginOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [loginReason, setLoginReason] = useState('')
  const [loginReturnTo, setLoginReturnTo] = useState('')
  const [toasts, setToasts] = useState([])
  const notificationBaseline = useRef({ token: null, initialized: false, fingerprints: new Set() })
  const [addCartItem] = useAddCartItemMutation()
  const { data: meResponse, error: meError } = useGetMeQuery(undefined, { skip: !token || isStoreRoute })
  const { data: storesResponse, error: storesError } = useGetStoresQuery(
    { limit: 100 },
    { skip: isStoreRoute, pollingInterval: isStoreRoute ? 0 : 15000 }
  )
  const { data: cartResponse, error: cartError } = useGetCartQuery(undefined, { skip: !token || isStoreRoute })
  const { data: notificationResponse } = useGetUserNotificationsQuery(
    { page: 1, limit: 8 },
    { skip: !token || isStoreRoute, pollingInterval: token && !isStoreRoute ? 30000 : 0 }
  )
  const isHomeRoute = location.pathname === '/'
  const activeOrdersQueryOptions = {
    skip: !token || isStoreRoute || !isHomeRoute,
    pollingInterval: token && !isStoreRoute && isHomeRoute ? 15000 : 0,
  }
  const { data: placedOrdersResponse, error: placedOrdersError } = useGetOrdersQuery(
    { page: 1, limit: 5, orderStatus: 'placed' },
    activeOrdersQueryOptions
  )
  const { data: packingOrdersResponse, error: packingOrdersError } = useGetOrdersQuery(
    { page: 1, limit: 5, orderStatus: 'packing' },
    activeOrdersQueryOptions
  )
  const { data: deliveryOrdersResponse, error: deliveryOrdersError } = useGetOrdersQuery(
    { page: 1, limit: 5, orderStatus: 'out for delivery' },
    activeOrdersQueryOptions
  )
  const { data: pickupOrdersResponse, error: pickupOrdersError } = useGetOrdersQuery(
    { page: 1, limit: 5, orderStatus: 'ready for pickup' },
    activeOrdersQueryOptions
  )

  const cartItems = token
    ? [...(cartResponse?.data?.items || []), ...guestItems.map((item) => ({ ...item, needsSync: true }))]
    : guestItems
  const cartCount = cartItems.length
  const selectedStoreIsClosed = selectedStore?.isOpen === false
  const activeOrder = [
    ...(placedOrdersResponse?.data || []),
    ...(packingOrdersResponse?.data || []),
    ...(deliveryOrdersResponse?.data || []),
    ...(pickupOrdersResponse?.data || []),
  ].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())[0]
  const activeOrdersError = placedOrdersError || packingOrdersError || deliveryOrdersError || pickupOrdersError

  useEffect(() => {
    const latestStore = storesResponse?.data?.find(({ _id }) => _id === selectedStore?._id)
    if (!latestStore) return
    if (
      latestStore.isOpen !== selectedStore.isOpen
      || latestStore.storePhone !== selectedStore.storePhone
      || latestStore.storeNumber !== selectedStore.storeNumber
    ) {
      dispatch(setSelectedStore({ ...selectedStore, ...latestStore }))
    }
  }, [dispatch, selectedStore, storesResponse])

  useEffect(() => {
    if (isStoreRoute) return
    const invalidToken = meError?.status === 401 || meError?.status === 403
    const wrongRole = meResponse?.role && meResponse.role !== 'user'
    if (token && (invalidToken || wrongRole)) {
      dispatch(signedOut())
      dispatch(api.util.resetApiState())
      dispatch(setSessionNotice(wrongRole ? 'This storefront is for customer accounts. Please sign in with your customer phone number.' : 'Your session expired. Sign in again to continue.'))
    }
  }, [dispatch, isStoreRoute, meError, meResponse, token])

  function openLogin(reason = '', returnTo = '') {
    setLoginReason(reason)
    setLoginReturnTo(returnTo)
    setLoginOpen(true)
  }

  const showToast = useCallback((notice) => {
    const id = createUuid()
    setToasts((current) => [...current, { ...notice, id }])
    return id
  }, [])

  const dismissToast = useCallback((toastId) => {
    setToasts((current) => current.filter(({ id }) => id !== toastId))
  }, [])

  useEffect(() => {
    if (!token || isStoreRoute) {
      notificationBaseline.current = { token: null, initialized: false, fingerprints: new Set() }
      return
    }
    if (!notificationResponse?.data) return
    if (notificationBaseline.current.token !== token) {
      notificationBaseline.current = { token, initialized: false, fingerprints: new Set() }
    }

    const fingerprints = notificationBaseline.current.fingerprints
    const currentFingerprints = new Set()
    for (const notification of notificationResponse.data) {
      const fingerprint = `${notification._id}:${notification.title}:${notification.message}`
      currentFingerprints.add(fingerprint)
      if (notificationBaseline.current.initialized && !fingerprints.has(fingerprint)) {
        showToast({
          type: 'notification',
          title: notification.title,
          message: notification.message,
          to: `/orders?order=${notification.orderId}`,
          actionLabel: 'View order'
        })
      }
    }
    notificationBaseline.current = { token, initialized: true, fingerprints: currentFingerprints }
  }, [isStoreRoute, notificationResponse, showToast, token])

  async function handleSignedIn() {
    for (const item of guestItems) {
      try {
        await addCartItem({
          productId: item.product._id,
          selectionType: item.selectionType,
          selectedQuantity: item.selectedQuantity,
          ...(item.selectedPackLabel ? { selectedPackLabel: item.selectedPackLabel } : {}),
        }).unwrap()
        dispatch(removeGuestItem(item.key))
      } catch (error) {
        return `Your account is ready, but ${item.product.productName} couldn’t sync: ${getErrorMessage(error)}`
      }
    }
    if (loginReturnTo) navigate(loginReturnTo)
    setLoginReturnTo('')
    return ''
  }

  if (isStoreRoute) return <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[var(--text-secondary)]"><span className="mr-2 inline-block h-4 w-4 rounded-full border-2 border-[var(--border-default)] border-t-[var(--brand-primary)] motion-safe:animate-spin" />Loading store workspace…</div>}>
      <Routes>
        <Route path="/store/login" element={<StoreLoginPage />} />
        <Route path="/store" element={<StoreDashboardPage />} />
        <Route path="/store/*" element={<Navigate to="/store" replace />} />
      </Routes>
    </Suspense>
  </div>

  return (
    <div id="customer-app" className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
      <Header
        cartCount={cartCount}
        onOpenCart={() => { if (!selectedStoreIsClosed) setCartOpen(true) }}
        onChooseStore={() => setStoreOpen(true)}
        onLogin={() => openLogin()}
        onCartError={cartError ? getErrorMessage(cartError) : ''}
      />
      {isHomeRoute && activeOrder && <ActiveOrderBanner order={activeOrder} />}
      {isHomeRoute && activeOrdersError && <p role="status" className="mx-auto max-w-7xl px-4 py-2 text-xs text-[var(--status-danger)] sm:px-6 lg:px-8">{activeOrder ? 'Some order status updates could not be refreshed.' : 'Couldn’t refresh your active order status.'} {getErrorMessage(activeOrdersError)}</p>}
      <main className="pb-24 md:pb-12">
        <Suspense fallback={<div className="mx-auto max-w-7xl px-5 py-20 text-center text-slate-500">Loading your page…</div>}>
          {selectedStoreIsClosed ? <section className="mx-auto grid min-h-[65vh] max-w-xl content-center justify-items-center px-5 py-16 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--status-danger-soft)] text-[var(--brand-primary)]"><ShoppingBasket size={28} /></span>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[.18em] text-[var(--brand-primary)]">Store temporarily closed</p>
            <h1 className="mt-2 font-display text-3xl font-medium text-[var(--text-primary)]">{selectedStore?.storeName} isn’t taking orders right now</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--text-secondary)]">You can choose another open store, or come back when this store reopens. Your basket will be cleared if you switch stores.</p>
            <button type="button" onClick={() => setStoreOpen(true)} className="mt-6 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-primary-hover)]">Choose an open store</button>
          </section> : <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/categories/:categoryId" element={<HomePage categoryScreen />} />
            <Route path="/cart" element={<CartDrawer
              open
              pageMode
              onClose={() => navigate('/')}
              items={cartItems}
              isGuest={!token}
              onLogin={() => openLogin('Sign in to sync your basket and check out.', '/checkout')}
              onSyncGuest={handleSignedIn}
            />} />
            <Route path="/checkout" element={<CheckoutPage onLogin={openLogin} onOpenCart={() => setCartOpen(true)} onToast={showToast} />} />
            <Route path="/profile" element={token ? <ProfilePage /> : <Navigate to="/" replace />} />
            <Route path="/orders" element={token ? <OrdersPage /> : <Navigate to="/" replace />} />
            <Route path="/notifications" element={<Navigate to={token ? '/orders' : '/'} replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>}
        </Suspense>
      </main>
      <footer className="border-t border-[var(--border-default)] bg-[var(--bg-app)] px-5 py-7 text-center text-xs text-[var(--text-secondary)]">
        Fresh from your neighbourhood. <span className="font-semibold text-[var(--brand-primary)]">NalliBokka.</span>
      </footer>
      {!isStoreRoute && <PwaInstallPrompt />}
      <nav className="customer-bottom-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--border-default)] bg-white/95 pt-2 text-[10px] font-medium text-[var(--text-secondary)] backdrop-blur md:hidden" aria-label="Main navigation">
        <NavLink className={({ isActive }) => `customer-bottom-nav-item py-1 ${isActive ? 'is-active' : ''}`} to="/" aria-label="Home">
          <span className="customer-bottom-nav-icon"><House size={19} strokeWidth={1.9} /></span>
          <span>Home</span>
        </NavLink>
        <NavLink className={({ isActive }) => `customer-bottom-nav-item py-1 ${isActive ? 'is-active' : ''}`} to="/categories" aria-label="Categories">
          <span className="customer-bottom-nav-icon"><Grid2X2 size={19} strokeWidth={1.9} /></span>
          <span>Categories</span>
        </NavLink>
        <NavLink to="/cart" aria-label={`Cart${cartCount ? `, ${cartCount} items` : ''}`} className={({ isActive }) => `customer-bottom-nav-item relative py-1 ${isActive ? 'is-active' : ''} ${selectedStoreIsClosed ? 'pointer-events-none opacity-40' : ''}`}>
          <span className="customer-bottom-nav-icon"><ShoppingBasket size={19} strokeWidth={1.9} />{cartCount > 0 && <span className="absolute right-[calc(50%-18px)] top-0 grid h-4 min-w-4 place-items-center rounded-full bg-[#8cc61f] px-1 text-[9px] font-bold text-white">{cartCount > 99 ? '99+' : cartCount}</span>}</span>
          <span>Cart</span>
        </NavLink>
        {token
          ? <NavLink className={({ isActive }) => `customer-bottom-nav-item py-1 ${isActive ? 'is-active' : ''}`} to="/orders" aria-label="Orders"><span className="customer-bottom-nav-icon"><PackageCheck size={19} strokeWidth={1.9} /></span><span>Orders</span></NavLink>
          : <button className="customer-bottom-nav-item py-1" onClick={() => openLogin('Sign in to view your orders.', '/orders')} aria-label="Orders"><span className="customer-bottom-nav-icon"><PackageCheck size={19} strokeWidth={1.9} /></span><span>Orders</span></button>}
        {token
          ? <NavLink className={({ isActive }) => `customer-bottom-nav-item py-1 ${isActive ? 'is-active' : ''}`} to="/profile" aria-label="Profile"><span className="customer-bottom-nav-icon"><UserRound size={19} strokeWidth={1.9} /></span><span>Profile</span></NavLink>
          : <button className="customer-bottom-nav-item py-1" onClick={() => openLogin()} aria-label="Profile"><span className="customer-bottom-nav-icon"><UserRound size={19} strokeWidth={1.9} /></span><span>Profile</span></button>}
      </nav>
      {token && meError && ![401, 403].includes(meError.status) && <p role="status" className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-lg rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow sm:bottom-4">We couldn’t verify your saved session. Some account features may be unavailable.</p>}
      {storesError && !selectedStore && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-800 shadow-lg">
          Couldn’t load stores: {getErrorMessage(storesError)}
        </div>
      )}
      <div className="pointer-events-none fixed right-3 top-3 z-[80] max-h-[calc(100vh-1.5rem)] w-[min(24rem,calc(100vw-1.5rem))] space-y-3 overflow-y-auto sm:right-5 sm:top-5">
        {toasts.map((toast) => <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />)}
      </div>
      <StorePicker open={storeOpen || selectedStoreIsClosed} onClose={() => setStoreOpen(false)} />
      <LoginDialog open={loginOpen || Boolean(sessionNotice)} reason={sessionNotice || loginReason} onClose={() => { setLoginOpen(false); dispatch(clearSessionNotice()); if (!token) setLoginReturnTo('') }} onSignedIn={handleSignedIn} />
      <CartDrawer
        open={cartOpen && !selectedStoreIsClosed && location.pathname !== '/cart'}
        onClose={() => setCartOpen(false)}
        items={cartItems}
        isGuest={!token}
        onLogin={() => { setCartOpen(false); openLogin('Sign in to sync your basket and check out.', '/checkout') }}
        onSyncGuest={handleSignedIn}
      />
    </div>
  )
}

export default App
