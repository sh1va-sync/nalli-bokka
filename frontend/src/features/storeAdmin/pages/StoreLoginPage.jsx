import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Store, LockKeyhole, UserRound } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { api, useStoreLoginMutation } from '../../api/api.js'
import { storeSignedIn } from '../storeAuthSlice.js'
import { getErrorMessage } from '../../customer/utils.js'

export default function StoreLoginPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const token = useSelector((state) => state.storeAuth.token)
  const [login, loginState] = useStoreLoginMutation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (token) return <Navigate to="/store" replace />

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      const result = await login({ username: username.trim(), password }).unwrap()
      dispatch(api.util.resetApiState())
      dispatch(storeSignedIn(result))
      navigate('/store', { replace: true })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[#fbf7f1] px-4 py-10">
    <section className="w-full max-w-md rounded-[24px] border border-[#eadfd7] bg-white p-6 shadow-[0_18px_55px_-38px_rgba(70,31,27,.38)] sm:p-8">
      <Link to="/" className="text-xs font-medium text-[#9b5148] hover:text-[#861923]">← Customer storefront</Link>
      <div className="mt-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f7ece7] text-[#861923]"><Store size={22} /></div>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.18em] text-[#ad7669]">NalliBokka store</p>
      <h1 className="mt-1 font-display text-3xl font-medium tracking-[-.035em] text-[#392824]">Welcome back</h1>
      <p className="mt-2 text-sm leading-6 text-[#82736d]">Sign in to manage your store, orders and inventory.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-xs font-semibold text-[#76534a]">USERNAME
          <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-[#eadfd7] px-3 focus-within:border-[#c98c7f]"><UserRound size={16} className="text-[#9b8178]" /><input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="w-full bg-transparent text-sm font-normal text-[#302724] outline-none" placeholder="Your store username" /></span>
        </label>
        <label className="block text-xs font-semibold text-[#76534a]">PASSWORD
          <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-[#eadfd7] px-3 focus-within:border-[#c98c7f]"><LockKeyhole size={16} className="text-[#9b8178]" /><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full bg-transparent text-sm font-normal text-[#302724] outline-none" placeholder="Your password" /></span>
        </label>
        {error && <p role="alert" className="rounded-xl bg-[#fbefec] px-3 py-2 text-sm text-[#8c4034]">{error}</p>}
        <button disabled={loginState.isLoading} className="h-12 w-full rounded-xl bg-[#861923] text-sm font-semibold text-white transition hover:bg-[#70131c] disabled:opacity-55">{loginState.isLoading ? 'Signing in…' : 'Sign in to dashboard'}</button>
      </form>
    </section>
  </main>
}
