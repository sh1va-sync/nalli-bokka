import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
const usesLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1):3000\/api\/?$/.test(configuredBaseUrl || '')
const baseUrl = ((import.meta.env.DEV && usesLocalApi) ? '/api' : configuredBaseUrl || '/api').replace(/\/$/, '')

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
      query: () => '/products/categories',
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
    }),
    markAllUserNotificationsRead: builder.mutation({
      query: () => ({ url: '/users/me/notifications/read-all', method: 'PATCH' }),
      invalidatesTags: ['Notifications'],
    }),
    getCart: builder.query({
      query: () => '/cart',
      providesTags: ['Cart'],
    }),
    addCartItem: builder.mutation({
      query: (body) => ({ url: '/cart/items', method: 'POST', body }),
      invalidatesTags: ['Cart'],
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
    }),
    refundStoreOrder: builder.mutation({
      query: (orderId) => ({ url: `/store/orders/${orderId}/refund`, method: 'POST' }),
      invalidatesTags: ['StoreOrders', 'StoreDashboard', 'StoreTransactions', 'StoreAudit'],
    }),
    getStoreTransactions: builder.query({
      query: (params = {}) => ({ url: '/store/transactions', params }),
      providesTags: ['StoreTransactions'],
    }),
    toggleStoreStatus: builder.mutation({
      query: (isOpen) => ({
        url: '/store/status',
        method: 'PATCH',
        body: { isOpen },
      }),
      invalidatesTags: ['StoreMe', 'Stores', 'StoreDashboard', 'StoreAudit'],
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
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
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
  useToggleStoreStatusMutation,
  useUpdateStoreHoursMutation,
  useExportStoreReportMutation,
} = api
