import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, MapPin, Plus, Save, Trash2, UserRound } from 'lucide-react'
import { api, useAddAddressMutation, useDeleteAddressMutation, useGetProfileQuery, useUpdateProfileMutation } from '../../api/api.js'
import { signedOut, setUser } from '../../auth/authSlice.js'
import CookingLoader from '../components/CookingLoader.jsx'
import { getErrorMessage } from '../utils.js'

export default function ProfilePage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const cachedUser = useSelector((state) => state.auth.user)
  const { data: profileResponse, isLoading, error } = useGetProfileQuery()
  const [updateProfile, profileState] = useUpdateProfileMutation()
  const [addAddress, addressState] = useAddAddressMutation()
  const [deleteAddress] = useDeleteAddressMutation()
  const profile = profileResponse?.data
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)
  const [address, setAddress] = useState({ label: 'Home', fullAddress: '', landmark: '', pincode: '' })
  const [message, setMessage] = useState('')
  const [addressError, setAddressError] = useState('')
  const [deletingId, setDeletingId] = useState('')

  async function saveProfile(event) {
    event.preventDefault()
    setMessage('')
    const body = {}
    if (nameTouched && name.trim()) body.name = name.trim()
    if (nameTouched && !name.trim()) {
      setMessage('Name must contain at least one character.')
      return
    }
    if (emailTouched) body.email = email.trim()
    if (!Object.keys(body).length) {
      setMessage('Enter the name or email you want to update.')
      return
    }
    try {
      const response = await updateProfile(body).unwrap()
      dispatch(setUser(response.data))
      setName('')
      setEmail('')
      setNameTouched(false)
      setEmailTouched(false)
      setMessage('Your profile is up to date.')
    } catch (requestError) {
      setMessage(getErrorMessage(requestError))
    }
  }

  async function saveAddress(event) {
    event.preventDefault()
    setAddressError('')
    try {
      await addAddress({ ...address, label: address.label.trim(), fullAddress: address.fullAddress.trim(), landmark: address.landmark.trim() }).unwrap()
      setAddress({ label: 'Home', fullAddress: '', landmark: '', pincode: '' })
    } catch (requestError) {
      setAddressError(getErrorMessage(requestError))
    }
  }

  async function removeAddress(addressId) {
    setDeletingId(addressId)
    try {
      await deleteAddress(addressId).unwrap()
    } catch (requestError) {
      setAddressError(getErrorMessage(requestError))
    } finally {
      setDeletingId('')
    }
  }

  function logout() {
    dispatch(signedOut())
    dispatch(api.util.resetApiState())
    navigate('/')
  }

  return <div className="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6 sm:pt-8 lg:px-8">
    {/* <header className="relative isolate mb-5 overflow-hidden rounded-[24px] bg-gradient-to-r from-[#edf5ee] via-[#eaf4eb] to-[#e1efe4] px-5 py-6 sm:mb-7 sm:rounded-[30px] sm:px-8 sm:py-8">
      <img src="/hero/green-market.svg" alt="" className="pointer-events-none absolute -right-7 bottom-0 h-[118%] w-[54%] object-contain object-right-bottom opacity-80 sm:right-0 sm:h-[125%] sm:w-[42%]" />
      <div className="relative z-10 max-w-[70%]">
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--brand-primary)] sm:text-xs">Your NalliBokka account</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-.045em] text-[var(--text-primary)] sm:mt-2 sm:text-5xl">My profile</h1>
        <p className="mt-2 text-xs text-[var(--text-secondary)] sm:text-base">Manage your details and delivery addresses.</p>
        <Link to="/orders" className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-white/80 px-4 text-xs font-bold text-[var(--brand-primary)] shadow-sm transition hover:bg-white sm:mt-5 sm:h-11 sm:text-sm">View my orders <ArrowRight size={16} /></Link>
      </div>
    </header> */}
    {error && <p role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{getErrorMessage(error)}</p>}
    {isLoading ? <div className="mt-6"><CookingLoader label="Getting your account ready…" /></div> : <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <section className="rounded-[24px] border border-[var(--border-default)] bg-white p-4 shadow-[0_8px_24px_-20px_rgba(17,44,31,.38)] sm:rounded-[26px] sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><UserRound size={22} /></span>
            <div><h2 className="text-lg font-extrabold text-[var(--text-primary)] sm:text-xl">Personal details</h2><p className="text-xs text-[var(--text-secondary)] sm:text-sm">Your account information</p></div>
          </div>
          <div className="mt-5 rounded-2xl bg-[#f2f7f2] p-4">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Phone</span>
            <span className="mt-1 block text-sm font-bold text-[var(--brand-primary)]">{profile?.phone || cachedUser?.phone || '—'}</span>
            <span className="mt-1 block text-[10px] leading-4 text-[var(--text-secondary)]">Your sign-in number can’t be changed here.</span>
          </div>
          <form onSubmit={saveProfile} className="mt-5 space-y-4">
            <label className="block text-xs font-bold text-[var(--brand-primary)]">NAME<input value={name} onChange={(event) => { setName(event.target.value); setNameTouched(true) }} placeholder={profile?.name || 'Your name'} maxLength={100} className="mt-1.5 h-12 w-full rounded-xl border border-[var(--border-default)] bg-white px-3.5 text-sm font-normal text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--brand-primary-soft)]" /></label>
            <label className="block text-xs font-bold text-[var(--brand-primary)]">EMAIL<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailTouched(true) }} placeholder={profile?.email || 'you@example.com'} maxLength={254} className="mt-1.5 h-12 w-full rounded-xl border border-[var(--border-default)] bg-white px-3.5 text-sm font-normal text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--brand-primary-soft)]" /></label>
            {profile?.email && !emailTouched && <button type="button" onClick={() => { setEmail(''); setEmailTouched(true) }} className="text-xs font-semibold text-[var(--text-secondary)] underline">Remove saved email</button>}
            {message && <p role="status" className="text-xs text-[var(--status-success)]">{message}</p>}
            <button disabled={profileState.isLoading} className="button-strong flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-sm transition hover:shadow-md disabled:opacity-50"><Save size={16} />{profileState.isLoading ? 'Saving…' : 'Save changes'}</button>
          </form>
          <button onClick={logout} className="mt-4 h-11 w-full rounded-xl border border-[var(--border-default)] text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--brand-secondary)] hover:bg-[var(--bg-app)]">Sign out</button>
        </section>
      <section className="rounded-[24px] border border-[var(--border-default)] bg-white p-4 shadow-[0_8px_24px_-20px_rgba(17,44,31,.38)] sm:rounded-[26px] sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><MapPin size={21} /></span>
          <div><h2 className="text-lg font-extrabold text-[var(--text-primary)] sm:text-xl">Delivery addresses</h2><p className="text-xs text-[var(--text-secondary)] sm:text-sm">Saved spots for your fresh deliveries.</p></div>
        </div>
        <div className="mt-4 space-y-2">
          {(profile?.addresses || []).map((savedAddress) => <div key={savedAddress._id} className="flex items-start gap-3 rounded-2xl border border-[var(--border-default)] bg-white p-4 transition hover:border-[var(--brand-secondary)]"><span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]"><MapPin size={18} /></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-[var(--text-primary)]">{savedAddress.label}</p><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{savedAddress.fullAddress}{savedAddress.landmark ? ` · ${savedAddress.landmark}` : ''}</p><p className="text-xs font-semibold text-[var(--text-secondary)]">{savedAddress.pincode}</p></div><button disabled={deletingId === savedAddress._id} onClick={() => removeAddress(savedAddress._id)} aria-label={`Delete ${savedAddress.label} address`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 size={16} /></button></div>)}
          {!profile?.addresses?.length && <p className="rounded-2xl bg-[#f2f7f2] p-4 text-sm text-[var(--text-secondary)]">No saved addresses yet. Add one below for a quicker checkout.</p>}
        </div>
        <form onSubmit={saveAddress} className="mt-5 rounded-2xl bg-[#f5f8f4] p-4 sm:mt-6 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-[var(--text-primary)] sm:text-base"><span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--brand-primary)]"><Plus size={17} /></span> Add a new address</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-[var(--brand-primary)]">LABEL<input required maxLength={40} value={address.label} onChange={(event) => setAddress({ ...address, label: event.target.value })} placeholder="Home" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--brand-primary-soft)]" /></label>
            <label className="text-xs font-bold text-[var(--brand-primary)]">PINCODE<input required pattern="[0-9]{6}" inputMode="numeric" maxLength={6} value={address.pincode} onChange={(event) => setAddress({ ...address, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="500001" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--brand-primary-soft)]" /></label>
            <label className="text-xs font-bold text-[var(--brand-primary)] sm:col-span-2">FULL ADDRESS<textarea required minLength={5} maxLength={500} rows={2} value={address.fullAddress} onChange={(event) => setAddress({ ...address, fullAddress: event.target.value })} placeholder="Flat, street, area, city" className="mt-1.5 w-full resize-y rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm font-normal text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--brand-primary-soft)]" /></label>
            <label className="text-xs font-bold text-[var(--brand-primary)] sm:col-span-2">LANDMARK <span className="font-normal text-[var(--text-secondary)]">(optional)</span><input maxLength={200} value={address.landmark} onChange={(event) => setAddress({ ...address, landmark: event.target.value })} placeholder="Near the park" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm font-normal text-[var(--text-primary)] outline-none transition focus:border-[var(--brand-primary)] focus:ring-4 focus:ring-[var(--brand-primary-soft)]" /></label>
          </div>
          {addressError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{addressError}</p>}
          <button disabled={addressState.isLoading} className="button-strong mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold shadow-sm transition hover:shadow-md disabled:opacity-50">{addressState.isLoading ? 'Adding…' : 'Add address'} <ArrowRight size={16} /></button>
        </form>
      </section>
    </div>}
  </div>
}
