// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';

export { GoogleAuthProvider };
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  // Always use Firebase's own authDomain (firebaseapp.com) — never proxy through wordai.pro.
  // Reason: signInWithPopup requires the popup's /__/auth/handler page to communicate back to
  // the opener. Proxying through a custom domain causes COOP issues that break popup auth.
  // Tauri desktop uses signInWithCredential (system browser OAuth), so it never needs this proxy.
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Firebase config ready

// Guard: during Next.js static-export prerender the NEXT_PUBLIC_* vars may be
// undefined (e.g. in CI when not forwarded to tauri-action's beforeBuildCommand).
// Throw a clear dev-time error but avoid crashing the build with an empty apiKey.
if (!firebaseConfig.apiKey) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[WordAI Firebase] NEXT_PUBLIC_FIREBASE_API_KEY is not set. Firebase will not be initialised.');
  }
}

// Initialize Firebase
const app = initializeApp(firebaseConfig.apiKey ? firebaseConfig : { ...firebaseConfig, apiKey: '__placeholder__' });

// Initialize Firebase Authentication and get a reference to the service
export const wordaiAuth = getAuth(app);

// Force browserLocalStorage persistence (uses synchronous localStorage API).
// This fixes Tauri WKWebView where IndexedDB writes (Firebase default) may not
// complete before a page navigation, causing the auth token to be "lost".
// browserLocalPersistence is synchronous → guaranteed to persist before any navigation.
//
// IMPORTANT: We export a promise so other modules can await it before signing in.
export const persistenceReady: Promise<void> = typeof window !== 'undefined'
  ? setPersistence(wordaiAuth, browserLocalPersistence).catch((e) => {
    console.warn('[WordAI] setPersistence failed, using default:', e);
  })
  : Promise.resolve();

// Initialize Google provider with additional settings
export const wordaiGoogleProvider = new GoogleAuthProvider();
wordaiGoogleProvider.addScope('email');
wordaiGoogleProvider.addScope('profile');

// Set custom parameters for better UX
wordaiGoogleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Initialize Analytics (only in browser, lazy loaded to avoid blocking)
let analytics: any = null;
if (typeof window !== 'undefined') {
  // Only load analytics in production to avoid blocking dev environment
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Defer analytics initialization to not block page load
    setTimeout(() => {
      try {
        analytics = getAnalytics(app);
      } catch (error) {
        // Analytics initialization failed silently
      }
    }, 100); // Load after 100ms, not blocking critical path
  }
}

export { analytics };

// Auth helper functions
export const setWordaiAuthPersistence = async () => {
  // Firebase web SDK automatically handles persistence
  return Promise.resolve();
};

export const testWordaiFirebaseConnection = async (): Promise<boolean> => {
  try {
    // Test Firebase connection by checking if auth is available
    const isConnected = !!wordaiAuth;
    return isConnected;
  } catch (error) {
    return false;
  }
};
