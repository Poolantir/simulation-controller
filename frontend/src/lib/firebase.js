// AI-ASSISTED
// Simulation Controller
// Matt Krueger, April 2026

import { getApps, initializeApp } from "firebase/app";
import { getFirestore as _getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const FIREBASE_DATABASE_ID =
  import.meta.env.VITE_FIREBASE_DATABASE_ID || "(default)";

function missingKeys() {
  return Object.entries(firebaseConfig)
    .filter(([, v]) => v == null || v === "")
    .map(([k]) => k);
}

/** Default Firebase app (idempotent). */
export function getFirebaseApp() {
  const missing = missingKeys();
  if (missing.length) {
    throw new Error(`Missing Firebase env: ${missing.join(", ")}`);
  }
  if (getApps().length) return getApps()[0];
  return initializeApp(firebaseConfig);
}

/** Firestore instance using the named database from env (or default). */
export function getDb() {
  const app = getFirebaseApp();
  return FIREBASE_DATABASE_ID === "(default)"
    ? _getFirestore(app)
    : _getFirestore(app, FIREBASE_DATABASE_ID);
}
