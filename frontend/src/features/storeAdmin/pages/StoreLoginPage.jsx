import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Store, LockKeyhole, UserRound } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { api, useStoreLoginMutation } from '../../api/api.js'
import { storeSignedIn } from '../storeAuthSlice.js'
import { getErrorMessage } from '../../customer/utils.js'
import LanguageSwitcher from '../../i18n/LanguageSwitcher.jsx'
import { useTranslation } from '../../i18n/LanguageContext.js'

export default function StoreLoginPage() {
  const t = useTranslation()
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

  return <main className="grid min-h-screen place-items-center bg-[var(--bg-app)] px-4 py-10">
    <section className="w-full max-w-md rounded-[24px] border border-[var(--border-default)] bg-white p-6 shadow-[0_18px_55px_-38px_rgba(70,31,27,.38)] sm:p-8">
      <div className="flex items-center justify-between gap-3"><Link to="/" className="text-xs font-medium text-[var(--brand-primary)] hover:text-[var(--brand-primary)]">← {t('Customer storefront')}</Link><LanguageSwitcher /></div>
      <div className="mt-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-subtle)] text-[var(--brand-primary)]"><Store size={22} /></div>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--brand-primary)]">{t('NalliBokka store')}</p>
      <h1 className="mt-1 font-display text-3xl font-medium tracking-[-.035em] text-[var(--text-primary)]">{t('Welcome back')}</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{t('Sign in to manage your store, orders and inventory.')}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">{t('USERNAME')}
          <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-[var(--border-default)] px-3 focus-within:border-[var(--brand-primary)]"><UserRound size={16} className="text-[var(--text-secondary)]" /><input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="w-full bg-transparent text-sm font-normal text-[var(--text-primary)] outline-none" placeholder={t('Your store username')} /></span>
        </label>
        <label className="block text-xs font-semibold text-[var(--text-secondary)]">{t('PASSWORD')}
          <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-[var(--border-default)] px-3 focus-within:border-[var(--brand-primary)]"><LockKeyhole size={16} className="text-[var(--text-secondary)]" /><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full bg-transparent text-sm font-normal text-[var(--text-primary)] outline-none" placeholder={t('Your password')} /></span>
        </label>
        {error && <p role="alert" className="rounded-xl bg-[var(--status-danger-soft)] px-3 py-2 text-sm text-[var(--status-danger)]">{t(error)}</p>}
        <button disabled={loginState.isLoading} className="h-12 w-full rounded-xl bg-[var(--brand-primary)] text-sm font-semibold text-white transition hover:bg-[var(--brand-primary-hover)] disabled:opacity-55">{loginState.isLoading ? t('Signing in…') : t('Sign in to dashboard')}</button>
      </form>
    </section>
  </main>
}
