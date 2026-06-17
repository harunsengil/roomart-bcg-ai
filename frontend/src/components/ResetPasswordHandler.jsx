import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth'
import { Loader2, KeyRound, Lock, AlertCircle, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { auth } from '../firebase'

const BASE = import.meta.env.BASE_URL || '/'
const MIN_LEN = 6

// Firebase parola-sıfırlama action handler'ı (kendi UI'mız).
// Firebase Console > Authentication > Templates > "Customize action URL" buraya yönlendirir;
// URL'de ?mode=resetPassword&oobCode=... gelir. App.jsx oobCode'u yakalayıp bunu render eder.
export default function ResetPasswordHandler({ oobCode }) {
  const [phase, setPhase] = useState('verifying')   // verifying | form | done | invalid
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Kod geçerli mi? Geçerliyse ilgili e-postayı al.
  useEffect(() => {
    let alive = true
    verifyPasswordResetCode(auth, oobCode)
      .then((mail) => { if (alive) { setEmail(mail); setPhase('form') } })
      .catch(() => { if (alive) setPhase('invalid') })
    return () => { alive = false }
  }, [oobCode])

  const goLogin = () => { window.location.href = BASE }   // temiz URL → App login gösterir

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (pw.length < MIN_LEN) { setError(`Parola en az ${MIN_LEN} karakter olmalı.`); return }
    if (pw !== pw2) { setError('Parolalar eşleşmiyor. İki alanı da aynı girin.'); return }
    setSubmitting(true)
    try {
      await confirmPasswordReset(auth, oobCode, pw)
      setPhase('done')
    } catch (err) {
      const map = {
        'auth/expired-action-code': 'Bağlantının süresi dolmuş. Lütfen yeni bir sıfırlama isteği gönderin.',
        'auth/invalid-action-code': 'Bağlantı geçersiz veya daha önce kullanılmış. Yeni bir istek gönderin.',
        'auth/weak-password': `Parola çok zayıf — en az ${MIN_LEN} karakter, daha güçlü bir parola seçin.`,
      }
      setError(map[err.code] || 'Parola güncellenemedi. Tekrar deneyin.')
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full pl-9 pr-10 py-2.5 text-sm font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/25 focus:outline-none focus:border-gold/40'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 grid-bg px-4">
      <div className="scan-line" />
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="font-display text-5xl tracking-[0.3em] text-white mb-1">ROOMART</div>
        <div className="font-display text-xl tracking-[0.5em] text-gold-400">BCG INTELLIGENCE</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
        className="w-full max-w-sm rounded-2xl border border-white/10 p-7 shadow-2xl backdrop-blur-xl"
        style={{ background: 'var(--bg-secondary)' }}>

        <div className="flex items-center gap-2 mb-6 text-white/70">
          <KeyRound size={15} className="text-gold-400" />
          <span className="font-mono text-xs tracking-widest uppercase">Yeni Parola Belirle</span>
        </div>

        {phase === 'verifying' && (
          <div className="flex items-center gap-3 text-white/50 text-sm font-mono py-4">
            <Loader2 size={16} className="animate-spin text-gold-400" /> Bağlantı doğrulanıyor…
          </div>
        )}

        {phase === 'invalid' && (
          <>
            <div className="flex items-start gap-2 mb-5 text-rose-400 text-xs font-mono">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>Bağlantı geçersiz veya süresi dolmuş. Lütfen giriş ekranından yeni bir sıfırlama isteği gönderin.</span>
            </div>
            <button onClick={goLogin}
              className="w-full py-2.5 rounded-lg font-mono text-sm bg-gold-500/90 text-black font-semibold hover:bg-gold-400 transition-all flex items-center justify-center gap-2">
              <ArrowLeft size={14} /> Giriş sayfasına dön
            </button>
          </>
        )}

        {phase === 'form' && (
          <form onSubmit={onSubmit}>
            <p className="text-[11px] font-mono text-white/45 mb-4 leading-relaxed">
              <b className="text-white/70">{email}</b> için yeni parolanızı belirleyin.
              Doğrulamak için iki kez girin.
            </p>

            <label className="block mb-3">
              <span className="text-[11px] font-mono text-white/40 mb-1.5 block">YENİ PAROLA</span>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input type={show ? 'text' : 'password'} value={pw} autoFocus autoComplete="new-password"
                  onChange={(e) => { setPw(e.target.value); error && setError(null) }}
                  placeholder="••••••••" className={inputCls} />
                <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>

            <label className="block mb-5">
              <span className="text-[11px] font-mono text-white/40 mb-1.5 block">YENİ PAROLA (TEKRAR)</span>
              <div className="relative">
                <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input type={show ? 'text' : 'password'} value={pw2} autoComplete="new-password"
                  onChange={(e) => { setPw2(e.target.value); error && setError(null) }}
                  placeholder="••••••••" className={inputCls} />
              </div>
            </label>

            {error && (
              <div className="flex items-center gap-2 mb-4 text-rose-400 text-xs font-mono">
                <AlertCircle size={13} className="flex-shrink-0" /><span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={submitting || !pw || !pw2}
              className="w-full py-2.5 rounded-lg font-mono text-sm tracking-wide bg-gold-500/90 text-black font-semibold hover:bg-gold-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Kaydediliyor…</> : 'Parolayı Kaydet'}
            </button>
          </form>
        )}

        {phase === 'done' && (
          <>
            <div className="flex items-start gap-2 mb-5 text-emerald-400 text-xs font-mono">
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              <span>Parolanız güncellendi. Yeni parolanızla giriş yapabilirsiniz.</span>
            </div>
            <button onClick={goLogin}
              className="w-full py-2.5 rounded-lg font-mono text-sm bg-gold-500/90 text-black font-semibold hover:bg-gold-400 transition-all flex items-center justify-center gap-2">
              <ArrowLeft size={14} /> Giriş sayfasına dön
            </button>
          </>
        )}
      </motion.div>
    </div>
  )
}
