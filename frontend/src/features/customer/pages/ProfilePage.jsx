import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { MapPin, Plus, Save, Trash2, UserRound } from 'lucide-react'
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

  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--brand-primary)]">Your little corner</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--text-primary)]">My account</h1></div><Link to="/orders" className="text-sm font-bold text-[var(--brand-primary)] hover:underline">View my orders →</Link></div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{getErrorMessage(error)}</p>}
    {isLoading ? <div className="mt-6"><CookingLoader label="Getting your account ready…" /></div> : <div className="mt-6 grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
      <div className="space-y-5">
        <section className="rounded-[22px] border border-[var(--border-default)] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--brand-primary)]"><UserRound size={19} /></span><div><h2 className="font-extrabold text-[var(--text-primary)]">Personal details</h2><p className="text-xs text-slate-500">Your account information</p></div></div>
          <div className="mt-5 rounded-xl bg-[var(--bg-app)] p-3 text-sm"><span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Phone</span><span className="mt-1 block font-semibold text-[var(--status-success)]">{profile?.phone || cachedUser?.phone || '—'}</span><span className="mt-1 block text-[10px] text-slate-400">Your sign-in number can’t be changed here.</span></div>
          <form onSubmit={saveProfile} className="mt-4 space-y-3">
            <label className="block text-xs font-bold text-[var(--status-success)]">NAME<input value={name} onChange={(event) => { setName(event.target.value); setNameTouched(true) }} placeholder={profile?.name || 'Your name'} maxLength={100} className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm font-normal outline-none focus:border-[var(--status-success)]" /></label>
            <label className="block text-xs font-bold text-[var(--status-success)]">EMAIL<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setEmailTouched(true) }} placeholder={profile?.email || 'you@example.com'} maxLength={254} className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm font-normal outline-none focus:border-[var(--status-success)]" /></label>
            {profile?.email && !emailTouched && <button type="button" onClick={() => { setEmail(''); setEmailTouched(true) }} className="text-xs font-semibold text-[var(--text-secondary)] underline">Remove saved email</button>}
            {message && <p role="status" className="text-xs text-[var(--status-success)]">{message}</p>}
            <button disabled={profileState.isLoading} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] text-sm font-bold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"><Save size={15} />{profileState.isLoading ? 'Saving…' : 'Save changes'}</button>
          </form>
          <button onClick={logout} className="mt-4 w-full rounded-xl border border-[#e4eadd] py-2.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-app)]">Sign out</button>
        </section>
      </div>
      <section className="rounded-[22px] border border-[var(--border-default)] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--brand-primary)]"><MapPin size={18} /></span><div><h2 className="font-extrabold text-[var(--text-primary)]">Delivery addresses</h2><p className="text-xs text-slate-500">Saved spots for your fresh deliveries.</p></div></div>
        <div className="mt-4 space-y-2">
          {(profile?.addresses || []).map((savedAddress) => <div key={savedAddress._id} className="flex items-start gap-3 rounded-xl border border-[#e8ede3] p-3.5"><span className="mt-0.5 text-lg">📍</span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-[var(--status-success)]">{savedAddress.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{savedAddress.fullAddress}{savedAddress.landmark ? ` · ${savedAddress.landmark}` : ''}</p><p className="text-xs text-slate-500">{savedAddress.pincode}</p></div><button disabled={deletingId === savedAddress._id} onClick={() => removeAddress(savedAddress._id)} aria-label={`Delete ${savedAddress.label} address`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 size={16} /></button></div>)}
          {!profile?.addresses?.length && <p className="rounded-xl bg-[var(--bg-app)] p-4 text-sm text-slate-500">No saved addresses yet.</p>}
        </div>
        <form onSubmit={saveAddress} className="mt-5 border-t border-[var(--surface-subtle)] pt-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]"><Plus size={16} /> Add a new address</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-[var(--status-success)]">LABEL<input required maxLength={40} value={address.label} onChange={(event) => setAddress({ ...address, label: event.target.value })} placeholder="Home" className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-default)] px-3 text-sm font-normal outline-none focus:border-[var(--status-success)]" /></label>
            <label className="text-xs font-bold text-[var(--status-success)]">PINCODE<input required pattern="[0-9]{6}" inputMode="numeric" maxLength={6} value={address.pincode} onChange={(event) => setAddress({ ...address, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="500001" className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-default)] px-3 text-sm font-normal outline-none focus:border-[var(--status-success)]" /></label>
            <label className="text-xs font-bold text-[var(--status-success)] sm:col-span-2">FULL ADDRESS<textarea required minLength={5} maxLength={500} rows={2} value={address.fullAddress} onChange={(event) => setAddress({ ...address, fullAddress: event.target.value })} placeholder="Flat, street, area, city" className="mt-1.5 w-full resize-y rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm font-normal outline-none focus:border-[var(--status-success)]" /></label>
            <label className="text-xs font-bold text-[var(--status-success)] sm:col-span-2">LANDMARK <span className="font-normal text-slate-400">(optional)</span><input maxLength={200} value={address.landmark} onChange={(event) => setAddress({ ...address, landmark: event.target.value })} placeholder="Near the park" className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-default)] px-3 text-sm font-normal outline-none focus:border-[var(--status-success)]" /></label>
          </div>
          {addressError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">{addressError}</p>}
          <button disabled={addressState.isLoading} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#b8cdb2] text-sm font-bold text-[var(--text-secondary)] hover:bg-[#f2f7ee] disabled:opacity-50">{addressState.isLoading ? 'Adding…' : 'Add address'}</button>
        </form>
      </section>
    </div>}
  </div>
}
