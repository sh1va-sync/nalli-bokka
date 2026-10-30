import { useEffect, useState } from 'react'
import { LottieLight } from 'lottie-react'
import { useTranslation } from '../../i18n/LanguageContext.js'

export default function StoreLoader({ label = 'Loading store workspace…', compact = false }) {
  const t = useTranslation()
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(mediaQuery.matches)
    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-4' : 'min-h-56 rounded-[20px] border border-[var(--border-default)] bg-white px-5 py-8'}`} role="status" aria-live="polite">
      <LottieLight
        src="/animations/grocery-delivery-loader.json"
        autoplay={!reducedMotion}
        loop={!reducedMotion}
        aria-hidden="true"
        className={compact ? 'h-24 w-32' : 'h-36 w-44'}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
      />
      <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">{t(label)}</p>
    </div>
  )
}
