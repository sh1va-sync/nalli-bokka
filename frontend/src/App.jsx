import { lazy, Suspense } from 'react'
import { Navigate, NavLink, Route, Routes, useMatch } from 'react-router-dom'
import { Grid2X2, House, PackageCheck, ShoppingBasket, UserRound } from 'lucide-react'
import { useGetProductCategoriesQuery, useGetProductsQuery } from './features/api/api.js'
import { clearSessionNotice } from './features/auth/authSlice.js'
import Header from './features/customer/components/Header.jsx'
import StorePicker from './features/customer/components/StorePicker.jsx'
import LoginDialog from './features/customer/components/LoginDialog.jsx'
import CartDrawer from './features/customer/components/CartDrawer.jsx'
import StartupLoader from './features/customer/components/StartupLoader.jsx'
import Toast from './features/customer/components/Toast.jsx'
import HomePage from './features/customer/pages/HomePage.jsx'
import ActiveOrderBanner from './features/customer/components/ActiveOrderBanner.jsx'
import PwaInstallPrompt from './features/customer/components/PwaInstallPrompt.jsx'
import { getErrorMessage } from './features/customer/utils.js'
import { useCustomerAppState } from './features/customer/hooks/useCustomerAppState.js'

const CheckoutPage = lazy(() => import('./features/customer/pages/CheckoutPage.jsx'))
const ProfilePage = lazy(() => import('./features/customer/pages/ProfilePage.jsx'))
const OrdersPage = lazy(() => import('./features/customer/pages/OrdersPage.jsx'))
const CategoriesPage = lazy(() => import('./features/customer/pages/CategoriesPage.jsx'))
const StoreLoginPage = lazy(() => import('./features/storeAdmin/pages/StoreLoginPage.jsx'))
const StoreDashboardPage = lazy(() => import('./features/storeAdmin/pages/StoreDashboardPage.jsx'))

function App() {
  const categoryMatch = useMatch('/categories/:categoryId')
  const {
    dispatch,
    token,
    cartItems,
    cartCount,
    selectedStore,
    startupRequestsLoading,
    selectedStoreIsClosed,
    storeOpen,
    setStoreOpen,
    loginOpen,
    sessionNotice,
    loginReason,
    cartError,
    storesError,
    meError,
    isStoreRoute,
    isHomeRoute,
    activeOrder,
    activeOrdersError,
    toasts,
    showToast,
    dismissToast,
    loginReturnTo,
    setLoginOpen,
    setLoginReturnTo,
    openLogin,
    handleSignedIn,
    navigate,
    cartOpen,
    setCartOpen,
    location,
  } = useCustomerAppState()
  const isCatalogRoute = location.pathname === '/' || location.pathname === '/categories' || Boolean(categoryMatch)
  const catalogQueryOptions = {
    skip: isStoreRoute || !isCatalogRoute || !selectedStore?._id,
  }
  const { isLoading: categoriesLoading } = useGetProductCategoriesQuery(
    { storeId: selectedStore?._id },
    catalogQueryOptions,
  )
  const { isLoading: productsLoading } = useGetProductsQuery(
    {
      storeId: selectedStore?._id,
      productType: categoryMatch?.params.categoryId,
      page: 1,
      limit: 24,
    },
    catalogQueryOptions,
  )
  const showStartupLoader = !isStoreRoute && (startupRequestsLoading || categoriesLoading || productsLoading)

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
      {showStartupLoader && <StartupLoader />}
      {isHomeRoute && activeOrder && <ActiveOrderBanner order={activeOrder} />}
      {isHomeRoute && activeOrdersError && <p role="status" className="mx-auto max-w-7xl px-4 py-2 text-xs text-[var(--status-danger)] sm:px-6 lg:px-8">{activeOrder ? 'Some order status updates could not be refreshed.' : 'Couldn’t refresh your active order status.'} {getErrorMessage(activeOrdersError)}</p>}
      <main className="pb-24 md:pb-12">
        <div key={location.pathname} className="customer-route-enter">
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
        </div>
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
