import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { ArrowLeft, CheckCircle2, Phone, ShieldCheck, X } from 'lucide-react'
import { signedIn } from '../../auth/authSlice.js'
import { useRegisterUserMutation, useSendUserOtpMutation, useVerifyUserOtpMutation } from '../../api/api.js'
import { getErrorMessage } from '../utils.js'
import { useTranslation } from '../../i18n/LanguageContext.js'

export default function LoginDialog({ open, reason, onClose, onSignedIn }) {
  const t = useTranslation()
  const dispatch = useDispatch()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('phone')
  const [registrationToken, setRegistrationToken] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sendUserOtp, sendState] = useSendUserOtpMutation()
  const [verifyUserOtp, verifyState] = useVerifyUserOtpMutation()
  const [registerUser, registerState] = useRegisterUserMutation()
  if (!open) return null

  const normalizedPhone = phone.startsWith('+') ? phone.replace(/[^\d+]/g, '') : `+91${phone.replace(/\D/g, '')}`
  const busy = sendState.isLoading || verifyState.isLoading || registerState.isLoading

  function changePhone() {
    setCode('')
    setRegistrationToken('')
    setStep('phone')
  }

  function closeDialog() {
    changePhone()
    onClose()
  }

  async function finishSignIn(result) {
    dispatch(signedIn({ token: result.token, user: result.user }))
    const syncError = await onSignedIn()
    if (syncError) {
      setMessage(syncError)
    } else {
      closeDialog()
    }
  }

  async function requestVerificationCode(event) {
    event?.preventDefault()
    setMessage('')
    try {
      await sendUserOtp({ phone: normalizedPhone }).unwrap()
      setCode('')
      setStep('code')
    } catch (error) {
      setMessage(getErrorMessage(error))
    }
  }

  async function submitCode(event) {
    event.preventDefault()
    setMessage('')
    try {
      const result = await verifyUserOtp({ phone: normalizedPhone, code }).unwrap()
      if (result.isNewUser) {
        setRegistrationToken(result.verificationToken)
        setStep('registration')
      } else {
        await finishSignIn(result)
      }
    } catch (error) {
      setMessage(getErrorMessage(error))
    }
  }

  async function submitRegistration(event) {
    event.preventDefault()
    setMessage('')
    try {
      const result = await registerUser({
        verificationToken: registrationToken,
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      }).unwrap()
      await finishSignIn(result)
    } catch (error) {
      setMessage(getErrorMessage(error))
    }
  }

  return (
    <div className="customer-dialog-backdrop fixed inset-0 z-[60] grid items-end bg-[var(--text-primary)]/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <section className="customer-dialog-panel relative mx-auto w-full max-w-md rounded-t-[24px] bg-[var(--bg-app)] p-6 shadow-2xl sm:rounded-[24px] sm:p-8">
        <button className="absolute right-5 top-5 rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]" onClick={closeDialog} aria-label={t('Close sign in')}><X size={19} /></button>
        <span className="mb-5 grid h-11 w-11 place-items-center rounded-full bg-[var(--status-danger-soft)] text-[var(--brand-primary)]">{step === 'phone' ? <Phone size={19} /> : <ShieldCheck size={20} />}</span>
        <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[var(--text-secondary)]">{t('NalliBokka account')}</p>
        <h2 id="login-title" className="mt-1 font-display text-2xl font-medium text-[var(--text-primary)]">{t(step === 'phone' ? 'Good food starts here' : step === 'code' ? 'Check your messages' : 'Create your account')}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{step === 'phone' ? t(reason || 'Sign in with your phone number. We’ll send you a one-time code.') : step === 'code' ? `${t('Enter the verification code sent to')} ${normalizedPhone}.` : t('Your phone number is verified. Add your name to finish creating your account.')}</p>
        {step === 'phone' ? (
          <form className="mt-6 space-y-4" onSubmit={requestVerificationCode}>
            <label className="block text-xs font-bold text-[var(--text-secondary)]">{t('PHONE NUMBER')}
              <div className="mt-2 flex h-12 items-center gap-2 rounded-xl border border-[var(--border-default)] bg-white px-3 focus-within:border-[var(--brand-primary)]"><span className="text-sm font-semibold text-[var(--brand-primary)]">+91</span><input autoFocus required inputMode="tel" maxLength={10} pattern="[0-9]{10}" value={phone.replace(/^\+91/, '')} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" className="w-full bg-transparent text-sm outline-none" /></div>
            </label>
            <button disabled={busy || phone.replace(/\D/g, '').length !== 10} className="button-strong flex h-12 w-full items-center justify-center rounded-xl bg-[var(--brand-primary)] text-sm font-medium text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50">{busy ? t('Sending code…') : t('Send verification code')}</button>
          </form>
        ) : step === 'code' ? (
          <form className="mt-6 space-y-3" onSubmit={submitCode}>
            <button type="button" onClick={changePhone} className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--brand-primary)]"><ArrowLeft size={14} /> {t('Change phone number')}</button>
            <input autoFocus required inputMode="numeric" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('Enter OTP')} className="h-12 w-full rounded-xl border border-[var(--border-default)] bg-white px-4 text-center text-lg tracking-[.35em] outline-none focus:border-[var(--brand-primary)]" />
            <button disabled={busy || code.length !== 6} className="button-strong flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] text-sm font-medium text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50">{busy ? t('Verifying…') : <><CheckCircle2 size={17} /> {t('Verify & continue')}</>}</button>
          </form>
        ) : (
          <form className="mt-6 space-y-3" onSubmit={submitRegistration}>
            <button type="button" onClick={changePhone} className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--brand-primary)]"><ArrowLeft size={14} /> {t('Change phone number')}</button>
            <label className="block text-xs font-bold text-[var(--text-secondary)]">{t('NAME')}
              <input required maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm font-normal outline-none focus:border-[var(--brand-primary)]" placeholder={t('Your name')} />
            </label>
            <label className="block text-xs font-bold text-[var(--text-secondary)]">{t('EMAIL')} <span className="font-normal text-slate-400">{t('(optional)')}</span>
              <input type="email" maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm font-normal outline-none focus:border-[var(--brand-primary)]" placeholder="you@example.com" />
            </label>
            <button disabled={busy || !name.trim()} className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--brand-primary)] text-sm font-medium text-white transition hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50">{busy ? t('Creating account…') : t('Create account and continue')}</button>
          </form>
        )}
        {message && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{t(message)}</p>}
        {step === 'code' && <button type="button" disabled={busy} onClick={requestVerificationCode} className="mt-4 w-full text-center text-xs font-semibold text-[var(--brand-primary)] disabled:opacity-50">{t('Didn’t get the code? Resend')}</button>}
        <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">{t('By continuing, you agree to receive a one-time verification SMS.')}</p>
      </section>
    </div>
  )
}
