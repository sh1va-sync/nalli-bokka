import { Languages } from 'lucide-react'
import { useLanguage } from './LanguageContext.js'
import { translate } from './translations.js'

export default function LanguageSwitcher({ compact = false }) {
  const { language, toggleLanguage } = useLanguage()
  const action = translate('Switch language', language)
  const label = language === 'te' ? 'English' : 'తెలుగు'

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={`${action}: ${label}`}
      title={label}
      className={`inline-flex ${compact ? 'h-10 w-10 px-0' : 'h-9 px-3'} items-center justify-center gap-1.5 rounded-full border border-[var(--border-default)] bg-white text-xs font-bold text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)]`}
    >
      <Languages size={15} aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </button>
  )
}
