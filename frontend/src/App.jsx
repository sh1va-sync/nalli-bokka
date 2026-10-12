import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { ShoppingBasket } from 'lucide-react'
import { removeGuestItem } from './features/cart/cartSlice.js'
import { api, useAddCartItemMutation, useGetCartQuery, useGetMeQuery, useGetStoresQuery } from './features/api/api.js'
import { clearSessionNotice, setSessionNotice, signedOut } from './features/auth/authSlice.js'
import Header from './features/customer/components/Header.jsx'
import StorePicker from './features/customer/components/StorePicker.jsx'
import LoginDialog from './features/customer/components/LoginDialog.jsx'
import CartDrawer from './features/customer/components/CartDrawer.jsx'
import Toast from './features/customer/components/Toast.jsx'
import HomePage from './features/customer/pages/HomePage.jsx'
import { createUuid, getErrorMessage } from './features/customer/utils.js'

const CheckoutPage = lazy(() => import('./features/customer/pages/CheckoutPage.jsx'))
const ProfilePage = lazy(() => import('./features/customer/pages/ProfilePage.jsx'))
const OrdersPage = lazy(() => import('./features/customer/pages/OrdersPage.jsx'))
const NotificationsPage = lazy(() => import('./features/customer/pages/NotificationsPage.jsx'))
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
  const [toast, setToast] = useState(null)
  const [addCartItem] = useAddCartItemMutation()
  const { data: meResponse, error: meError } = useGetMeQuery(undefined, { skip: !token || isStoreRoute })
  const { error: storesError } = useGetStoresQuery({ limit: 100 }, { skip: isStoreRoute })
  const { data: cartResponse, error: cartError } = useGetCartQuery(undefined, { skip: !token || isStoreRoute })

  const cartItems = token
    ? [...(cartResponse?.data?.items || []), ...guestItems.map((item) => ({ ...item, needsSync: true }))]
    : guestItems
  const cartCount = cartItems.length

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
    setToast({ ...notice, id: createUuid() })
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

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

  if (isStoreRoute) return <div className="min-h-screen bg-[#fbf7f1] text-[#302724]">
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-[#82736d]">Loading store dashboard…</div>}>
      <Routes>
        <Route path="/store/login" element={<StoreLoginPage />} />
        <Route path="/store" element={<StoreDashboardPage />} />
        <Route path="/store/*" element={<Navigate to="/store" replace />} />
      </Routes>
    </Suspense>
  </div>

  return (
    <div className="min-h-screen bg-[#fbf7f1] text-[#302724]">
      <Header
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
        onChooseStore={() => setStoreOpen(true)}
        onLogin={() => openLogin()}
        onCartError={cartError ? getErrorMessage(cartError) : ''}
      />
      <main className="pb-24 md:pb-12">
        <Suspense fallback={<div className="mx-auto max-w-7xl px-5 py-20 text-center text-slate-500">Loading your page…</div>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/checkout" element={<CheckoutPage onLogin={openLogin} onOpenCart={() => setCartOpen(true)} onToast={showToast} />} />
            <Route path="/profile" element={token ? <ProfilePage /> : <Navigate to="/" replace />} />
            <Route path="/orders" element={token ? <OrdersPage /> : <Navigate to="/" replace />} />
            <Route path="/notifications" element={token ? <NotificationsPage /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="border-t border-[#eadfd7] bg-[#fbf7f1] px-5 py-7 text-center text-xs text-[#927f74]">
        Fresh from your neighbourhood. <span className="font-semibold text-[#861923]">NalliBokka.</span>
      </footer>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-[#eadfd7] bg-[#fbf7f1]/95 py-2 text-xs font-medium text-[#82736d] backdrop-blur md:hidden">
        <Link className="flex flex-col items-center gap-1 py-1 text-[#861923]" to="/">⌂<span>Shop</span></Link>
        <button className="flex flex-col items-center gap-1 py-1" onClick={() => setCartOpen(true)}><ShoppingBasket size={18} /><span>Basket</span></button>
        {token ? <Link className="flex flex-col items-center gap-1 py-1" to="/profile">◉<span>Account</span></Link> : <button className="flex flex-col items-center gap-1 py-1" onClick={() => openLogin()}>◉<span>Account</span></button>}
      </nav>
      {token && meError && ![401, 403].includes(meError.status) && <p role="status" className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-lg rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow sm:bottom-4">We couldn’t verify your saved session. Some account features may be unavailable.</p>}
      {storesError && !selectedStore && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-800 shadow-lg">
          Couldn’t load stores: {getErrorMessage(storesError)}
        </div>
      )}
      <div className="pointer-events-none fixed right-3 top-3 z-[80] w-[min(24rem,calc(100vw-1.5rem))] sm:right-5 sm:top-5">
        <Toast key={toast?.id} toast={toast} onDismiss={dismissToast} />
      </div>
      <StorePicker open={storeOpen} onClose={() => setStoreOpen(false)} />
      <LoginDialog open={loginOpen || Boolean(sessionNotice)} reason={sessionNotice || loginReason} onClose={() => { setLoginOpen(false); dispatch(clearSessionNotice()); if (!token) setLoginReturnTo('') }} onSignedIn={handleSignedIn} />
      <CartDrawer
        open={cartOpen}
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
