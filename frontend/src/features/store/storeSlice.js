import { createSlice } from '@reduxjs/toolkit'
import { readStoredJson } from '../../app/persistence.js'

const selectedStore = readStoredJson('nalli-store')

const storeSlice = createSlice({
  name: 'selectedStore',
  initialState: selectedStore || null,
  reducers: {
    setSelectedStore(_state, action) { return action.payload },
  },
})

export const { setSelectedStore } = storeSlice.actions
export default storeSlice.reducer
