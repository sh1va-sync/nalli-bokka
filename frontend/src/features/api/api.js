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
  tagTypes: ['Stores', 'Products', 'Cart', 'Profile', 'Orders', 'StoreDashboard', 'StoreProducts', 'StoreOrders', 'StoreTransactions'],
  endpoints: (builder) => ({
    getStores: builder.query({
      query: (params = {}) => ({ url: '/stores', params }),
      providesTags: ['Stores'],
    }),
    getProducts: builder.query({
      query: (params = {}) => ({ url: '/products', params }),
      providesTags: (result) => [
        'Products',
        ...(result?.data || []).map(({ _id }) => ({ type: 'Products', id: _id })),
      ],
    }),
    requestOtp: builder.mutation({
      query: (body) => ({ url: '/auth/users/otp', method: 'POST', body }),
    }),
    verifyOtp: builder.mutation({
      query: (body) => ({ url: '/auth/users/verify', method: 'POST', body }),
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
    createOrder: builder.mutation({
      query: ({ idempotencyKey, ...body }) => ({
        url: '/orders',
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body,
      }),
      invalidatesTags: ['Cart', 'Orders'],
    }),
    getOrders: builder.query({
      query: (params = {}) => ({ url: '/orders', params }),
      providesTags: ['Orders'],
    }),
    getOrder: builder.query({
      query: (orderId) => `/orders/${orderId}`,
      providesTags: (_result, _error, orderId) => [{ type: 'Orders', id: orderId }],
    }),
    cancelOrder: builder.mutation({
      query: (orderId) => ({ url: `/orders/${orderId}/cancel`, method: 'POST' }),
      invalidatesTags: ['Orders'],
    }),
    createPayment: builder.mutation({
      query: (orderId) => ({ url: `/orders/${orderId}/payment`, method: 'POST' }),
    }),
    verifyPayment: builder.mutation({
      query: (body) => ({ url: '/payments/razorpay/verify', method: 'POST', body }),
      invalidatesTags: ['Orders'],
    }),
    storeLogin: builder.mutation({
      query: (body) => ({ url: '/auth/stores/login', method: 'POST', body }),
    }),
    getStoreMe: builder.query({
      query: () => '/auth/me',
    }),
    getStoreDashboard: builder.query({
      query: (params = {}) => ({ url: '/store/dashboard', params }),
      providesTags: ['StoreDashboard'],
    }),
    getStoreProducts: builder.query({
      query: (params = {}) => ({ url: '/store/products', params }),
      providesTags: ['StoreProducts'],
    }),
    createStoreProduct: builder.mutation({
      query: (body) => ({ url: '/store/products', method: 'POST', body }),
      invalidatesTags: ['StoreProducts', 'StoreDashboard'],
    }),
    updateStoreProduct: builder.mutation({
      query: ({ productId, ...body }) => ({ url: `/store/products/${productId}`, method: 'PATCH', body }),
      invalidatesTags: ['StoreProducts', 'StoreDashboard'],
    }),
    setStoreProductStock: builder.mutation({
      query: ({ productId, inStock }) => ({ url: `/store/products/${productId}/stock`, method: 'PATCH', body: { inStock } }),
      invalidatesTags: ['StoreProducts', 'StoreDashboard'],
    }),
    deleteStoreProduct: builder.mutation({
      query: (productId) => ({ url: `/store/products/${productId}`, method: 'DELETE' }),
      invalidatesTags: ['StoreProducts', 'StoreDashboard'],
    }),
    getStoreOrders: builder.query({
      query: (params = {}) => ({ url: '/store/orders', params }),
      providesTags: ['StoreOrders'],
    }),
    updateStoreOrderStatus: builder.mutation({
      query: ({ orderId, orderStatus }) => ({ url: `/store/orders/${orderId}/status`, method: 'PATCH', body: { orderStatus } }),
      invalidatesTags: ['StoreOrders', 'StoreDashboard', 'StoreTransactions'],
    }),
    getStoreTransactions: builder.query({
      query: (params = {}) => ({ url: '/store/transactions', params }),
      providesTags: ['StoreTransactions'],
    }),
  }),
})

export const {
  useGetStoresQuery,
  useGetProductsQuery,
  useRequestOtpMutation,
  useVerifyOtpMutation,
  useGetMeQuery,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useAddAddressMutation,
  useUpdateAddressMutation,
  useDeleteAddressMutation,
  useGetCartQuery,
  useAddCartItemMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useCreateOrderMutation,
  useGetOrdersQuery,
  useGetOrderQuery,
  useCancelOrderMutation,
  useCreatePaymentMutation,
  useVerifyPaymentMutation,
  useStoreLoginMutation,
  useGetStoreMeQuery,
  useGetStoreDashboardQuery,
  useGetStoreProductsQuery,
  useCreateStoreProductMutation,
  useUpdateStoreProductMutation,
  useSetStoreProductStockMutation,
  useDeleteStoreProductMutation,
  useGetStoreOrdersQuery,
  useUpdateStoreOrderStatusMutation,
  useGetStoreTransactionsQuery,
} = api
