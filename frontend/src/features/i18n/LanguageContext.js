import { createContext, useContext, useMemo } from 'react'
import { translate } from './translations.js'

export const LanguageContext = createContext(null)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used within LanguageProvider')
  return context
}

export function useTranslation() {
  const { language } = useLanguage()
  return useMemo(() => (text) => translate(text, language), [language])
}
