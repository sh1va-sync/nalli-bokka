import { useCallback, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { removeGuestItem } from '../../cart/cartSlice.js'
import { setSelectedStore } from '../../store/storeSlice.js'
import {
  api,
  useAddCartItemMutation,
  useGetCartQuery,
  useGetMeQuery,
  useGetOrdersQuery,
  useGetStoresQuery,
  useGetUserNotificationsQuery,
} from '../../api/api.js'
import { clearSessionNotice, setSessionNotice, signedOut } from '../../auth/authSlice.js'
import { createUuid, getErrorMessage } from '../utils.js'

export function useCustomerAppState() {
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
    { skip: isStoreRoute, pollingInterval: isStoreRoute ? 0 : 60000 }
  )
  const { data: cartResponse, error: cartError } = useGetCartQuery(undefined, { skip: !token || isStoreRoute })
  const { data: notificationResponse } = useGetUserNotificationsQuery(
    { page: 1, limit: 8 },
    { skip: !token || isStoreRoute, pollingInterval: token && !isStoreRoute ? 60000 : 0 }
  )

  const isHomeRoute = location.pathname === '/'
  const activeOrdersQueryOptions = {
    skip: !token || isStoreRoute || !isHomeRoute,
    pollingInterval: token && !isStoreRoute && isHomeRoute ? 60000 : 0,
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

  const openLogin = useCallback((reason = '', returnTo = '') => {
    setLoginReason(reason)
    setLoginReturnTo(returnTo)
    setLoginOpen(true)
  }, [])

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
          actionLabel: 'View order',
        })
      }
    }
    notificationBaseline.current = { token, initialized: true, fingerprints: currentFingerprints }
  }, [isStoreRoute, notificationResponse, showToast, token])

  const handleSignedIn = useCallback(async () => {
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
  }, [addCartItem, dispatch, guestItems, loginReturnTo, navigate])

  return {
    token,
    guestItems,
    selectedStore,
    sessionNotice,
    storeOpen,
    setStoreOpen,
    loginOpen,
    setLoginOpen,
    cartOpen,
    setCartOpen,
    loginReason,
    setLoginReason,
    loginReturnTo,
    setLoginReturnTo,
    toasts,
    showToast,
    dismissToast,
    cartItems,
    cartCount,
    selectedStoreIsClosed,
    activeOrder,
    activeOrdersError,
    cartError,
    storesError,
    meError,
    meResponse,
    isStoreRoute,
    isHomeRoute,
    openLogin,
    handleSignedIn,
    navigate,
    location,
    dispatch,
  }
}
