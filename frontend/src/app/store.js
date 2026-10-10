import { configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit'
import { api } from '../features/api/api.js'
import authReducer, { setUser, signedIn, signedOut } from '../features/auth/authSlice.js'
import storeReducer, { setSelectedStore } from '../features/store/storeSlice.js'
import cartReducer, { addGuestItem, clearGuestCart, removeGuestItem, updateGuestItem } from '../features/cart/cartSlice.js'
import storeAuthReducer, { storeSignedIn, storeSignedOut } from '../features/storeAdmin/storeAuthSlice.js'

const persistence = createListenerMiddleware()

persistence.startListening({
  matcher: isAnyOf(signedIn, signedOut),
  effect: (action) => {
    if (signedIn.match(action)) {
      localStorage.setItem('nalli-token', action.payload.token)
      localStorage.setItem('nalli-user', JSON.stringify(action.payload.user))
    } else {
      localStorage.removeItem('nalli-token')
      localStorage.removeItem('nalli-user')
    }
  },
})

persistence.startListening({
  matcher: isAnyOf(storeSignedIn, storeSignedOut),
  effect: (action) => {
    if (storeSignedIn.match(action)) {
      localStorage.setItem('nalli-store-token', action.payload.token)
      localStorage.setItem('nalli-store-account', JSON.stringify(action.payload.store))
    } else {
      localStorage.removeItem('nalli-store-token')
      localStorage.removeItem('nalli-store-account')
    }
  },
})

persistence.startListening({
  actionCreator: setUser,
  effect: (action) => localStorage.setItem('nalli-user', JSON.stringify(action.payload)),
})

persistence.startListening({
  actionCreator: setSelectedStore,
  effect: (action) => localStorage.setItem('nalli-store', JSON.stringify(action.payload)),
})

persistence.startListening({
  matcher: isAnyOf(addGuestItem, updateGuestItem, removeGuestItem, clearGuestCart),
  effect: (_action, listenerApi) => {
    const guestItems = listenerApi.getState().cart.guestItems
    if (guestItems.length) localStorage.setItem('nalli-guest-cart', JSON.stringify(guestItems))
    else localStorage.removeItem('nalli-guest-cart')
  },
})

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authReducer,
    selectedStore: storeReducer,
    cart: cartReducer,
    storeAuth: storeAuthReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(persistence.middleware).concat(api.middleware),
})
