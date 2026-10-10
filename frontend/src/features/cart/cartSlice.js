import { createSlice } from '@reduxjs/toolkit'
import { readStoredJson } from '../../app/persistence.js'

const guestItems = readStoredJson('nalli-guest-cart')

const cartSlice = createSlice({
  name: 'cart',
  initialState: { guestItems: Array.isArray(guestItems) ? guestItems : [] },
  reducers: {
    addGuestItem(state, action) {
      const incoming = action.payload
      const existing = state.guestItems.find((item) =>
        item.product._id === incoming.product._id &&
        item.selectionType === incoming.selectionType &&
        item.selectedPackLabel === incoming.selectedPackLabel,
      )
      if (existing) existing.selectedQuantity += incoming.selectedQuantity
      else state.guestItems.push(incoming)
    },
    updateGuestItem(state, action) {
      const item = state.guestItems.find(({ key }) => key === action.payload.key)
      if (item) item.selectedQuantity = action.payload.selectedQuantity
    },
    removeGuestItem(state, action) {
      state.guestItems = state.guestItems.filter(({ key }) => key !== action.payload)
    },
    clearGuestCart(state) {
      state.guestItems = []
    },
  },
})

export const { addGuestItem, updateGuestItem, removeGuestItem, clearGuestCart } = cartSlice.actions
export default cartSlice.reducer
