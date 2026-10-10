import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { ArrowLeft, CheckCircle2, Phone, ShieldCheck, X } from 'lucide-react'
import { signedIn } from '../../auth/authSlice.js'
import { useRequestOtpMutation, useVerifyOtpMutation } from '../../api/api.js'
import { getErrorMessage } from '../utils.js'

export default function LoginDialog({ open, reason, onClose, onSignedIn }) {
  const dispatch = useDispatch()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('phone')
  const [message, setMessage] = useState('')
  const [requestOtp, requestState] = useRequestOtpMutation()
  const [verifyOtp, verifyState] = useVerifyOtpMutation()
  if (!open) return null

  const normalizedPhone = phone.startsWith('+') ? phone.replace(/[^\d+]/g, '') : `+91${phone.replace(/\D/g, '')}`
  const busy = requestState.isLoading || verifyState.isLoading

  async function submitPhone(event) {
    event.preventDefault()
    setMessage('')
    try {
      await requestOtp({ phone: normalizedPhone }).unwrap()
      setStep('code')
    } catch (error) {
      setMessage(getErrorMessage(error))
    }
  }

  async function submitCode(event) {
    event.preventDefault()
    setMessage('')
    try {
      const result = await verifyOtp({
        phone: normalizedPhone,
        code,
      }).unwrap()
      dispatch(signedIn({ token: result.token, user: result.user }))
      const syncError = await onSignedIn()
      if (syncError) {
        setMessage(syncError)
      } else {
        onClose()
      }
    } catch (error) {
      setMessage(getErrorMessage(error))
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid items-end bg-[#24251f]/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <section className="relative mx-auto w-full max-w-md rounded-t-[24px] bg-[#fbf7f1] p-6 shadow-2xl sm:rounded-[24px] sm:p-8">
        <button className="absolute right-5 top-5 rounded-full p-2 text-[#797b70] hover:bg-[#eeede6]" onClick={onClose} aria-label="Close sign in"><X size={19} /></button>
        <span className="mb-5 grid h-11 w-11 place-items-center rounded-full bg-[#f3e2dc] text-[#861923]">{step === 'phone' ? <Phone size={19} /> : <ShieldCheck size={20} />}</span>
        <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#9a8176]">NalliBokka account</p>
        <h2 id="login-title" className="mt-1 font-display text-2xl font-medium text-[#392824]">{step === 'phone' ? 'Good food starts here' : 'Check your messages'}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{reason || (step === 'phone' ? 'Sign in with your phone number. We’ll send you a one-time code.' : `Enter the verification code sent to ${normalizedPhone}.`)}</p>
        {step === 'phone' ? (
          <form className="mt-6 space-y-4" onSubmit={submitPhone}>
            <label className="block text-xs font-bold text-[#76534a]">PHONE NUMBER
              <div className="mt-2 flex h-12 items-center gap-2 rounded-xl border border-[#eadfd7] bg-white px-3 focus-within:border-[#c98c7f]"><span className="text-sm font-semibold text-[#9b5148]">+91</span><input autoFocus required inputMode="tel" maxLength={10} pattern="[0-9]{10}" value={phone.replace(/^\+91/, '')} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" className="w-full bg-transparent text-sm outline-none" /></div>
            </label>
            <button disabled={busy || phone.replace(/\D/g, '').length !== 10} className="flex h-12 w-full items-center justify-center rounded-xl bg-[#861923] text-sm font-medium text-white transition hover:bg-[#70131c] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Sending code…' : 'Send verification code'}</button>
          </form>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={submitCode}>
            <button type="button" onClick={() => setStep('phone')} className="mb-1 flex items-center gap-1 text-xs font-semibold text-[#9b5148]"><ArrowLeft size={14} /> Change phone number</button>
            <input autoFocus required inputMode="numeric" minLength={4} maxLength={10} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter OTP" className="h-12 w-full rounded-xl border border-[#eadfd7] bg-white px-4 text-center text-lg tracking-[.35em] outline-none focus:border-[#c98c7f]" />
            <button disabled={busy || code.length < 4} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#861923] text-sm font-medium text-white transition hover:bg-[#70131c] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Verifying…' : <><CheckCircle2 size={17} /> Verify & continue</>}</button>
          </form>
        )}
        {message && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p>}
        {step === 'code' && !message && <button disabled={busy} onClick={submitPhone} className="mt-4 w-full text-center text-xs font-semibold text-[#9b5148] disabled:opacity-50">Didn’t get the code? Resend</button>}
        <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">By continuing, you agree to receive a one-time verification SMS.</p>
      </section>
    </div>
  )
}
