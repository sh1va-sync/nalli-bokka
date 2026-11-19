import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { settleOptimistic } from '../src/features/api/optimistic.js'

test('failed writes restore basket and operational state in reverse patch order', async () => {
  const slice = createSlice({
    name: 'view', initialState: { basket: ['milk'], isOpen: true },
    reducers: { set: (_state, action) => action.payload },
  })
  const store = configureStore({ reducer: slice.reducer })
  const previous = store.getState()
  store.dispatch(slice.actions.set({ basket: [], isOpen: false }))
  const undone = []
  await settleOptimistic(Promise.reject(new Error('offline')), [
    { undo: () => { undone.push('basket'); store.dispatch(slice.actions.set(previous)) } },
    { undo: () => undone.push('store') },
  ])
  assert.deepEqual(undone, ['store', 'basket'])
  assert.deepEqual(store.getState(), { basket: ['milk'], isOpen: true })
})

test('successful writes preserve the optimistic state', async () => {
  let undone = false
  await settleOptimistic(Promise.resolve({ data: {} }), [{ undo: () => { undone = true } }])
  assert.equal(undone, false)
})
