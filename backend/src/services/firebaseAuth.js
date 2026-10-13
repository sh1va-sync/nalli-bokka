import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import AppError from '../utils/AppError.js';

function getFirebaseAdminApp() {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new AppError(503, 'Firebase Authentication is not configured');
  }

  const existingApp = getApps().find(app => app.name === 'nalli-bokka-auth');
  if (existingApp) {
    return existingApp;
  }

  return initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }),
    projectId: FIREBASE_PROJECT_ID
  }, 'nalli-bokka-auth');
}

const firebaseAuth = {
  verifyIdToken(idToken) {
    return getAuth(getFirebaseAdminApp()).verifyIdToken(idToken);
  }
};

export default firebaseAuth;
