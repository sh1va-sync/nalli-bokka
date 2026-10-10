export function readStoredJson(key) {
  const value = localStorage.getItem(key)
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    console.warn(`Ignoring malformed local data for ${key}.`, error)
    localStorage.removeItem(key)
    return null
  }
}
