import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configureStore } from '@reduxjs/toolkit'
import { api } from '../src/features/api/api.js'

test('cart clear failure rolls back actual RTK Query cached basket', async () => {
  const originalRequest = globalThis.Request
  const originalFetch = globalThis.fetch
  globalThis.Request = class extends originalRequest {
    constructor(input, options) {
      super(typeof input === 'string' ? new URL(input, 'http://localhost').href : input, options)
    }
  }
  let rejectDelete
  globalThis.fetch = async (request) => {
    if (request.method === 'DELETE') {
      return new Promise((resolve) => { rejectDelete = () => resolve(Response.json({ error: 'offline' }, { status: 503 })) })
    }
    return Response.json({ data: { items: [{ itemId: 'milk' }], total: 25, hasUnavailableItems: false } })
  }
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, auth: () => ({ token: null }), storeAuth: () => ({ token: null }) },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  })
  try {
    await store.dispatch(api.endpoints.getCart.initiate(undefined, { subscribe: false })).unwrap()
    const mutation = store.dispatch(api.endpoints.clearCart.initiate())
    assert.deepEqual(api.endpoints.getCart.select()(store.getState()).data.data.items, [])
    while (!rejectDelete) await new Promise((resolve) => setTimeout(resolve, 0))
    rejectDelete()
    await mutation
    await new Promise((resolve) => setTimeout(resolve, 0))
    const result = api.endpoints.getCart.select()(store.getState()).data
    // No active subscriber means invalidation may remove the cache entirely.
    // Requerying must retrieve the unchanged server basket.
    const cart = result || await store.dispatch(api.endpoints.getCart.initiate(undefined, { subscribe: false })).unwrap()
    assert.deepEqual(cart.data.items, [{ itemId: 'milk' }])
  } finally {
    store.dispatch(api.util.resetApiState())
    globalThis.Request = originalRequest
    globalThis.fetch = originalFetch
  }
})
