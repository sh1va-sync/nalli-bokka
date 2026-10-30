import { useEffect, useMemo, useState } from 'react'
import { translate } from './translations.js'
import { LanguageContext } from './LanguageContext.js'
const languageStorageKey = 'nalli-language'

function getInitialLanguage() {
  try {
    return localStorage.getItem(languageStorageKey) === 'te' ? 'te' : 'en'
  } catch {
    return 'en'
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage)

  useEffect(() => {
    document.documentElement.lang = language === 'te' ? 'te' : 'en'
    document.title = translate('NalliBokka — Fresh, fast, local', language)
    const description = document.querySelector('meta[name="description"]')
    if (description) {
      description.content = translate(
        'Fresh groceries, fruits, vegetables and meat delivered from NalliBokka.',
        language,
      )
    }
    try {
      localStorage.setItem(languageStorageKey, language)
    } catch (error) {
      console.error('Could not save the selected application language.', error)
    }
  }, [language])

  const value = useMemo(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage((current) => current === 'te' ? 'en' : 'te'),
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
