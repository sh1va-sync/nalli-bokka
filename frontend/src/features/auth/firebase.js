import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

export function getFirebaseAuth() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
  const missingConfig = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missingConfig.length) {
    throw new Error(`Firebase Authentication is not configured. Set ${missingConfig.join(', ')} in frontend/.env.`)
  }

  const appName = `nalli-bokka-${config.projectId}`
  const app = getApps().find((existingApp) => existingApp.name === appName)
    || initializeApp(config, appName)
  return getAuth(app)
}
