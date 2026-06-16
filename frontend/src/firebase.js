import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "roomart-bcg-ai.firebaseapp.com",
  projectId: "roomart-bcg-ai",
  storageBucket: "roomart-bcg-ai.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
// Oturum kalıcı (sekme/sayfa kapansa da açık kalır; logout'ta temizlenir).
setPersistence(auth, browserLocalPersistence).catch(() => {})
