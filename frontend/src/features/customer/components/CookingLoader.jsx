import { useEffect, useState } from 'react'
import { LottieLight } from 'lottie-react'

export default function CookingLoader({ label = 'Preparing the good stuff…', compact = false }) {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(mediaQuery.matches)
    updatePreference()
    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])

  return (
    <div className={`customer-cooking-loader flex flex-col items-center justify-center text-center ${compact ? 'py-3' : 'min-h-48 rounded-2xl border border-[var(--border-default)] bg-white px-5 py-7'}`} role="status" aria-live="polite">
      <LottieLight
        src="/animations/grocery-delivery-loader.json"
        autoplay={!reducedMotion}
        loop={!reducedMotion}
        aria-hidden="true"
        className={compact ? 'h-24 w-32' : 'h-36 w-44'}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
      />
      <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">{label}</p>
      <a href="https://lottiefiles.com/free-animation/grocery-shopping-bag-pickup-and-delivery-Wolnzed6M2" target="_blank" rel="noreferrer" className="mt-1 text-[9px] text-[var(--text-tertiary)] underline-offset-2 hover:underline">Animation by MD Abdur Rahim · LottieFiles</a>
    </div>
  )
}
