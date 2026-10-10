import { createSlice } from '@reduxjs/toolkit'
import { readStoredJson } from '../../app/persistence.js'

const storeAuthSlice = createSlice({
  name: 'storeAuth',
  initialState: {
    token: localStorage.getItem('nalli-store-token') || null,
    store: readStoredJson('nalli-store-account'),
  },
  reducers: {
    storeSignedIn(state, action) {
      state.token = action.payload.token
      state.store = action.payload.store
    },
    storeSignedOut(state) {
      state.token = null
      state.store = null
    },
  },
})

export const { storeSignedIn, storeSignedOut } = storeAuthSlice.actions
export default storeAuthSlice.reducer
