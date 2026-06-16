import { useState, useEffect, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth } from '../firebase'

// Firebase Auth durumunu izleyen hook (email/şifre — Seviye A arayüz kilidi).
// Hesaplar Firebase Console'da elle açılır (self-signup YOK) → hesap listesi = allowlist.
export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  const login = useCallback(async (email, password) => {
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      return true
    } catch (e) {
      // Firebase hata kodlarını okunur Türkçe'ye çevir
      const map = {
        'auth/invalid-email': 'Geçersiz e-posta adresi.',
        'auth/user-disabled': 'Bu hesap devre dışı bırakılmış.',
        'auth/user-not-found': 'E-posta veya şifre hatalı.',
        'auth/wrong-password': 'E-posta veya şifre hatalı.',
        'auth/invalid-credential': 'E-posta veya şifre hatalı.',
        'auth/too-many-requests': 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.',
        'auth/network-request-failed': 'Ağ hatası. Bağlantınızı kontrol edin.',
      }
      setError(map[e.code] || 'Giriş başarısız. Tekrar deneyin.')
      return false
    }
  }, [])

  const logout = useCallback(() => signOut(auth), [])

  return { user, loading, error, login, logout, setError }
}
