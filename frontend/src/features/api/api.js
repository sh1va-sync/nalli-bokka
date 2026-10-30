import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
const usesLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1):3000\/api\/?$/.test(configuredBaseUrl || '')
const baseUrl = ((import.meta.env.DEV && usesLocalApi) ? '/api' : configuredBaseUrl || '/api').replace(/\/$/, '')

function updateCartTotal(cart) {
  const items = cart.data?.items
  if (!items) return
  cart.data.hasUnavailableItems = items.some((item) => item.available === false)
  cart.data.total = cart.data.hasUnavailableItems
    ? null
    : Number(items.reduce((total, item) => total + Number(item.lineTotal || 0), 0).toFixed(2))
}

function updateCachedQueries(dispatch, getState, endpointName, update) {
  const queries = Object.values(getState().api.queries || {})
    .filter((query) => query.endpointName === endpointName)
  for (const query of queries) {
    dispatch(api.util.updateQueryData(endpointName, query.originalArgs, update))
  }
}

function addOptimisticCartItem(cart, body, product) {
  const items = cart.data?.items
  if (!items || !product) return

  const existing = items.find((item) => (
    String(item.productId) === String(body.productId)
    && item.selectionType === body.selectionType
    && item.selectedPackLabel === body.selectedPackLabel
  ))
  const pack = product.packs?.find(({ label }) => label === body.selectedPackLabel)
  const unitPrice = body.selectionType === 'pack'
    ? Number(pack?.price)
    : body.selectionType === 'pieces'
      ? Number(product.pricePerKg) * Number(product.pieceWeightGrams) / 1000
      : Number(product.pricePerKg)

  if (existing) {
    existing.selectedQuantity += body.selectedQuantity
    existing.available = true
    existing.pendingAdd = true
    existing.unitPrice = unitPrice
    existing.lineTotal = Number((unitPrice * existing.selectedQuantity).toFixed(2))
  } else {
    items.push({
      itemId: `optimistic-${body.productId}-${body.selectionType}-${body.selectedPackLabel || ''}`,
      productId: body.productId,
      productName: product.productName,
      imageUrl: product.imageUrl,
      selectionType: body.selectionType,
      selectedQuantity: body.selectedQuantity,
      ...(body.selectedPackLabel ? { selectedPackLabel: body.selectedPackLabel } : {}),
      available: true,
      pendingAdd: true,
      unitPrice,
      lineTotal: Number((unitPrice * body.selectedQuantity).toFixed(2)),
    })
  }
  updateCartTotal(cart)
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl,
    prepareHeaders: (headers, { getState, endpoint }) => {
      const isStoreEndpoint = endpoint.startsWith('store') || endpoint.includes('Store')
      const token = endpoint === 'storeLogin'
        ? null
        : isStoreEndpoint ? getState().storeAuth.token : getState().auth.token
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return headers
    },
  }),
  tagTypes: ['Stores', 'Products', 'ProductCategories', 'Cart', 'Profile', 'Orders', 'Notifications', 'StoreMe', 'StoreDashboard', 'StoreProducts', 'StoreProductCategories', 'StoreOrders', 'StoreTransactions', 'StoreAudit'],
  endpoints: (builder) => ({
    getStores: builder.query({
      query: (params = {}) => ({ url: '/stores', params }),
      providesTags: ['Stores'],
      keepUnusedDataFor: 300,
    }),
    getPickupSlots: builder.query({
      query: ({ storeId, date }) => ({
        url: `/stores/${storeId}/pickup-slots`,
        params: { date },
      }),
    }),
    getProducts: builder.query({
      query: (params = {}) => ({ url: '/products', params }),
      providesTags: (result) => [
        'Products',
        ...(result?.data || []).map(({ _id }) => ({ type: 'Products', id: _id })),
      ],
      keepUnusedDataFor: 300,
    }),
    getProductCategories: builder.query({
      query: (params = {}) => ({ url: '/products/categories', params }),
      providesTags: ['ProductCategories'],
      keepUnusedDataFor: 300,
    }),
    verifyFirebasePhoneToken: builder.mutation({
      query: (body) => ({ url: '/auth/users/verify', method: 'POST', body }),
    }),
    registerUser: builder.mutation({
      query: (body) => ({ url: '/auth/users/register', method: 'POST', body }),
    }),
    getMe: builder.query({
      query: () => '/auth/me',
    }),
    getProfile: builder.query({
      query: () => '/users/me',
      providesTags: ['Profile'],
    }),
    updateProfile: builder.mutation({
      query: (body) => ({ url: '/users/me', method: 'PATCH', body }),
      invalidatesTags: ['Profile'],
      async onQueryStarted(changes, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getProfile', undefined, (profile) => {
          if (profile.data) Object.assign(profile.data, changes)
        }))
        try {
          await queryFulfilled
        } catch {
          patch.undo()
        }
      },
    }),
    addAddress: builder.mutation({
      query: (body) => ({ url: '/users/me/addresses', method: 'POST', body }),
      invalidatesTags: ['Profile'],
    }),
    updateAddress: builder.mutation({
      query: ({ addressId, ...body }) => ({
        url: `/users/me/addresses/${addressId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Profile'],
    }),
    deleteAddress: builder.mutation({
      query: (addressId) => ({
        url: `/users/me/addresses/${addressId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Profile'],
      async onQueryStarted(addressId, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getProfile', undefined, (profile) => {
          if (profile.data?.addresses) {
            profile.data.addresses = profile.data.addresses.filter(({ _id }) => _id !== addressId)
          }
        }))
        try {
          await queryFulfilled
        } catch {
          patch.undo()
        }
      },
    }),
    getUserNotifications: builder.query({
      query: (params = {}) => ({ url: '/users/me/notifications', params }),
      providesTags: ['Notifications'],
      keepUnusedDataFor: 300,
    }),
    markUserNotificationRead: builder.mutation({
      query: (notificationId) => ({
        url: `/users/me/notifications/${notificationId}/read`,
        method: 'PATCH',
      }),
      invalidatesTags: ['Notifications'],
      async onQueryStarted(notificationId, { dispatch, getState, queryFulfilled }) {
        const patches = []
        const queries = Object.values(getState().api.queries || {})
          .filter((query) => query.endpointName === 'getUserNotifications')
        for (const query of queries) {
          patches.push(dispatch(api.util.updateQueryData('getUserNotifications', query.originalArgs, (result) => {
            const notification = result.data?.find(({ _id }) => _id === notificationId)
            if (notification && !notification.readAt) {
              notification.readAt = new Date().toISOString()
              result.unreadCount = Math.max(0, (result.unreadCount || 0) - 1)
            }
          })))
        }
        try {
          await queryFulfilled
        } catch {
          patches.forEach((patch) => patch.undo())
        }
      },
    }),
    markAllUserNotificationsRead: builder.mutation({
      query: () => ({ url: '/users/me/notifications/read-all', method: 'PATCH' }),
      invalidatesTags: ['Notifications'],
      async onQueryStarted(_arg, { dispatch, getState, queryFulfilled }) {
        const patches = []
        const queries = Object.values(getState().api.queries || {})
          .filter((query) => query.endpointName === 'getUserNotifications')
        for (const query of queries) {
          patches.push(dispatch(api.util.updateQueryData('getUserNotifications', query.originalArgs, (result) => {
            for (const notification of result.data || []) {
              notification.readAt ||= new Date().toISOString()
            }
            result.unreadCount = 0
          })))
        }
        try {
          await queryFulfilled
        } catch {
          patches.forEach((patch) => patch.undo())
        }
      },
    }),
    getCart: builder.query({
      query: () => '/cart',
      providesTags: ['Cart'],
    }),
    addCartItem: builder.mutation({
      query: (arg) => {
        const body = { ...arg }
        delete body.product
        return { url: '/cart/items', method: 'POST', body }
      },
      invalidatesTags: ['Cart'],
      async onQueryStarted({ product, ...body }, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getCart', undefined, (cart) => {
          addOptimisticCartItem(cart, body, product)
        }))
        try {
          await queryFulfilled
        } catch {
          patch.undo()
        }
      },
    }),
    addCartItems: builder.mutation({
      query: (arg) => {
        const body = { ...arg }
        delete body.product
        return { url: '/cart/items/bulk', method: 'POST', body }
      },
      invalidatesTags: ['Cart'],
      async onQueryStarted({ product, productId, items }, { dispatch, queryFulfilled }) {
        const patch = dispatch(api.util.updateQueryData('getCart', undefined, (cart) => {
          for (const item of items) {
            addOptimisticCartItem(cart, { ...item, productId }, product)
          }
        }))
        try {
          await queryFulfilled
        } catch {
          patch.undo()
        }
      },
    }),
    updateCartItem: builder.mutation({
      query: ({ itemId, ...body }) => ({
        url: `/cart/items/${itemId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Cart'],
    }),
    removeCartItem: builder.mutation({
      query: (itemId) => ({ url: `/cart/items/${itemId}`, method: 'DELETE' }),
      invalidatesTags: ['Cart'],
    }),
    clearCart: builder.mutation({
      query: () => ({ url: '/cart/items', method: 'DELETE' }),
      invalidatesTags: ['Cart'],
      onQueryStarted(_arg, { dispatch }) {
        dispatch(api.util.updateQueryData('getCart', undefined, (cart) => {
          if (!cart.data) return
          cart.data.items = []
          cart.data.total = 0
          cart.data.hasUnavailableItems = false
        }))
      },
    }),
    createCheckoutPayment: builder.mutation({
      query: (body) => ({
        url: '/payments/razorpay/order',
        method: 'POST',
        body,
      }),
    }),
    getOrders: builder.query({
      query: (params = {}) => ({ url: '/orders', params }),
      providesTags: ['Orders'],
    }),
    getOrder: builder.query({
      query: (orderId) => `/orders/${orderId}`,
    }),
    downloadOrderInvoice: builder.mutation({
      query: (orderId) => ({
        url: `/orders/${orderId}/invoice`,
        responseHandler: async (response) => response.ok ? response.blob() : response.json(),
      }),
      providesTags: (_result, _error, orderId) => [{ type: 'Orders', id: orderId }],
    }),
    cancelOrder: builder.mutation({
      query: (orderId) => ({ url: `/orders/${orderId}/cancel`, method: 'POST' }),
      invalidatesTags: ['Orders'],
      async onQueryStarted(orderId, { dispatch, getState, queryFulfilled }) {
        const patches = [
          dispatch(api.util.updateQueryData('getOrder', orderId, (result) => {
            if (result.data) result.data.orderStatus = 'cancelled'
          })),
        ]
        const queries = Object.values(getState().api.queries || {})
          .filter((query) => query.endpointName === 'getOrders')
        for (const query of queries) {
          patches.push(dispatch(api.util.updateQueryData('getOrders', query.originalArgs, (result) => {
            const order = result.data?.find(({ _id }) => _id === orderId)
            if (order) order.orderStatus = 'cancelled'
          })))
        }
        try {
          await queryFulfilled
        } catch {
          patches.forEach((patch) => patch.undo())
        }
      },
    }),
    createPayment: builder.mutation({
      query: (orderId) => ({ url: `/orders/${orderId}/payment`, method: 'POST' }),
    }),
    markCheckoutPaymentFailed: builder.mutation({
      query: (razorpayOrderId) => ({
        url: `/payments/razorpay/${encodeURIComponent(razorpayOrderId)}/failed`,
        method: 'POST',
      }),
    }),
    verifyPayment: builder.mutation({
      query: (body) => ({ url: '/payments/razorpay/verify', method: 'POST', body }),
      invalidatesTags: ['Cart', 'Orders'],
    }),
    storeLogin: builder.mutation({
      query: (body) => ({ url: '/auth/stores/login', method: 'POST', body }),
    }),
    getStoreMe: builder.query({
      query: () => '/auth/me',
      providesTags: ['StoreMe'],
    }),
    getStoreDashboard: builder.query({
      query: (params = {}) => ({ url: '/store/dashboard', params }),
      providesTags: ['StoreDashboard'],
    }),
    getStoreAuditEvents: builder.query({
      query: (params = {}) => ({ url: '/store/audit-events', params }),
      providesTags: ['StoreAudit'],
    }),
    getStoreProductCategories: builder.query({
      query: () => '/store/product-categories',
      providesTags: ['StoreProductCategories'],
    }),
    createStoreProductCategory: builder.mutation({
      query: (body) => ({ url: '/store/product-categories', method: 'POST', body }),
      invalidatesTags: ['StoreProductCategories', 'ProductCategories', 'StoreAudit'],
    }),
    deleteStoreProductCategory: builder.mutation({
      query: (name) => ({ url: `/store/product-categories/${encodeURIComponent(name)}`, method: 'DELETE' }),
      invalidatesTags: ['StoreProductCategories', 'ProductCategories', 'StoreAudit'],
    }),
    getStoreProducts: builder.query({
      query: (params = {}) => ({ url: '/store/products', params }),
      providesTags: ['StoreProducts'],
    }),
    createStoreProduct: builder.mutation({
      query: (body) => ({ url: '/store/products', method: 'POST', body }),
      invalidatesTags: ['StoreProducts', 'Products', 'StoreDashboard', 'StoreAudit'],
    }),
    updateStoreProduct: builder.mutation({
      query: ({ productId, body }) => ({ url: `/store/products/${productId}`, method: 'PATCH', body }),
      invalidatesTags: ['StoreProducts', 'Products', 'StoreDashboard', 'StoreAudit'],
    }),
    setStoreProductStock: builder.mutation({
      query: ({ productId, inStock }) => ({ url: `/store/products/${productId}/stock`, method: 'PATCH', body: { inStock } }),
      invalidatesTags: ['StoreProducts', 'Products', 'StoreDashboard', 'StoreAudit'],
      onQueryStarted({ productId, inStock }, { dispatch, getState }) {
        for (const endpointName of ['getStoreProducts', 'getProducts']) {
          updateCachedQueries(dispatch, getState, endpointName, (result) => {
            const product = result.data?.find(({ _id }) => _id === productId)
            if (product) product.inStock = inStock
          })
        }
      },
    }),
    deleteStoreProduct: builder.mutation({
      query: (productId) => ({ url: `/store/products/${productId}`, method: 'DELETE' }),
      invalidatesTags: ['StoreProducts', 'Products', 'StoreDashboard', 'StoreAudit'],
    }),
    getStoreOrders: builder.query({
      query: (params = {}) => ({ url: '/store/orders', params }),
      providesTags: ['StoreOrders'],
    }),
    downloadStoreOrderInvoice: builder.mutation({
      query: (orderId) => ({
        url: `/store/orders/${orderId}/invoice`,
        responseHandler: async (response) => response.ok ? response.blob() : response.json(),
      }),
    }),
    updateStoreOrderStatus: builder.mutation({
      query: ({ orderId, orderStatus }) => ({ url: `/store/orders/${orderId}/status`, method: 'PATCH', body: { orderStatus } }),
      invalidatesTags: ['StoreOrders', 'StoreDashboard', 'StoreTransactions', 'StoreAudit'],
      onQueryStarted({ orderId, orderStatus }, { dispatch, getState }) {
        updateCachedQueries(dispatch, getState, 'getStoreOrders', (result) => {
          const order = result.data?.find(({ _id }) => _id === orderId)
          if (order) order.orderStatus = orderStatus
        })
      },
    }),
    refundStoreOrder: builder.mutation({
      query: (orderId) => ({ url: `/store/orders/${orderId}/refund`, method: 'POST' }),
      invalidatesTags: ['StoreOrders', 'StoreDashboard', 'StoreTransactions', 'StoreAudit'],
    }),
    getStoreTransactions: builder.query({
      query: (params = {}) => ({ url: '/store/transactions', params }),
      providesTags: ['StoreTransactions'],
    }),
    getStoreTransaction: builder.query({
      query: (transactionId) => `/store/transactions/${transactionId}`,
      providesTags: ['StoreTransactions'],
    }),
    addStoreTransactionNote: builder.mutation({
      query: ({ transactionId, note }) => ({
        url: `/store/transactions/${transactionId}/notes`,
        method: 'POST',
        body: { note },
      }),
      invalidatesTags: ['StoreTransactions'],
    }),
    reorderOrder: builder.mutation({
      query: (orderId) => ({ url: `/cart/reorder/${orderId}`, method: 'POST' }),
      invalidatesTags: ['Cart'],
    }),
    toggleStoreStatus: builder.mutation({
      query: (isOpen) => ({
        url: '/store/status',
        method: 'PATCH',
        body: { isOpen },
      }),
      invalidatesTags: ['StoreMe', 'Stores', 'StoreDashboard', 'StoreAudit'],
      onQueryStarted(isOpen, { dispatch, getState }) {
        dispatch(api.util.updateQueryData('getStoreMe', undefined, (result) => {
          if (result.account) result.account.isOpen = isOpen
        }))
        dispatch(api.util.updateQueryData('getMe', undefined, (result) => {
          if (result.account) result.account.isOpen = isOpen
        }))
        updateCachedQueries(dispatch, getState, 'getStores', (result) => {
          const store = result.data?.find(({ _id }) => _id === getState().storeAuth.store?.id)
          if (store) store.isOpen = isOpen
        })
      },
    }),
    updateStoreHours: builder.mutation({
      query: (body) => ({ url: '/store/hours', method: 'PATCH', body }),
      invalidatesTags: ['StoreMe', 'Stores', 'StoreAudit'],
    }),
    exportStoreReport: builder.mutation({
      query: (params) => ({
        url: '/store/reports/export',
        params,
        responseHandler: async (response) => response.ok ? response.blob() : response.json(),
      }),
    }),
  }),
})

export const {
  useGetStoresQuery,
  useGetPickupSlotsQuery,
  useGetProductsQuery,
  useGetProductCategoriesQuery,
  useVerifyFirebasePhoneTokenMutation,
  useRegisterUserMutation,
  useGetMeQuery,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useAddAddressMutation,
  useUpdateAddressMutation,
  useDeleteAddressMutation,
  useGetUserNotificationsQuery,
  useMarkUserNotificationReadMutation,
  useMarkAllUserNotificationsReadMutation,
  useGetCartQuery,
  useAddCartItemMutation,
  useAddCartItemsMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useClearCartMutation,
  useCreateCheckoutPaymentMutation,
  useGetOrdersQuery,
  useGetOrderQuery,
  useDownloadOrderInvoiceMutation,
  useCancelOrderMutation,
  useCreatePaymentMutation,
  useMarkCheckoutPaymentFailedMutation,
  useVerifyPaymentMutation,
  useStoreLoginMutation,
  useGetStoreMeQuery,
  useGetStoreDashboardQuery,
  useGetStoreAuditEventsQuery,
  useGetStoreProductCategoriesQuery,
  useCreateStoreProductCategoryMutation,
  useDeleteStoreProductCategoryMutation,
  useGetStoreProductsQuery,
  useCreateStoreProductMutation,
  useUpdateStoreProductMutation,
  useSetStoreProductStockMutation,
  useDeleteStoreProductMutation,
  useGetStoreOrdersQuery,
  useDownloadStoreOrderInvoiceMutation,
  useUpdateStoreOrderStatusMutation,
  useRefundStoreOrderMutation,
  useGetStoreTransactionsQuery,
  useGetStoreTransactionQuery,
  useAddStoreTransactionNoteMutation,
  useReorderOrderMutation,
  useToggleStoreStatusMutation,
  useUpdateStoreHoursMutation,
  useExportStoreReportMutation,
} = api
