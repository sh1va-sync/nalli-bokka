import { createSlice } from '@reduxjs/toolkit'
import { readStoredJson } from '../../app/persistence.js'

const storedToken = localStorage.getItem('nalli-token')
const storedUser = readStoredJson('nalli-user')

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    token: storedToken || null,
    user: storedUser || null,
    sessionNotice: '',
  },
  reducers: {
    signedIn(state, action) {
      state.token = action.payload.token
      state.user = action.payload.user
      state.sessionNotice = ''
    },
    signedOut(state) {
      state.token = null
      state.user = null
      state.sessionNotice = ''
    },
    setUser(state, action) {
      state.user = action.payload
    },
    setSessionNotice(state, action) {
      state.sessionNotice = action.payload
    },
    clearSessionNotice(state) {
      state.sessionNotice = ''
    },
  },
})

export const { signedIn, signedOut, setUser, setSessionNotice, clearSessionNotice } = authSlice.actions
export default authSlice.reducer
