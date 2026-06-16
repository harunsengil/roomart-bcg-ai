import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Lock, Mail, AlertCircle } from 'lucide-react'

// Seviye A arayüz kilidi — email/şifre. Hesaplar Firebase Console'da elle açılır.
export default function LoginScreen({ login, error, setError, busy }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password || submitting) return
    setSubmitting(true)
    await login(email, password)
    setSubmitting(false)
  }

  const loading = submitting || busy

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 grid-bg px-4">
      <div className="scan-line" />
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="font-display text-5xl tracking-[0.3em] text-white mb-1">ROOMART</div>
        <div className="font-display text-xl tracking-[0.5em] text-gold-400">BCG INTELLIGENCE</div>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/10 p-7 shadow-2xl backdrop-blur-xl"
        style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2 mb-6 text-white/70">
          <Lock size={15} className="text-gold-400" />
          <span className="font-mono text-xs tracking-widest uppercase">Yetkili Girişi</span>
        </div>

        <label className="block mb-3">
          <span className="text-[11px] font-mono text-white/40 mb-1.5 block">E-POSTA</span>
          <div className="relative">
            <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              type="email" value={email} autoFocus autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); error && setError(null) }}
              placeholder="ad@roomart.com"
              className="w-full pl-9 pr-3 py-2.5 text-sm font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/25 focus:outline-none focus:border-gold/40" />
          </div>
        </label>

        <label className="block mb-5">
          <span className="text-[11px] font-mono text-white/40 mb-1.5 block">ŞİFRE</span>
          <div className="relative">
            <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              type="password" value={password} autoComplete="current-password"
              onChange={(e) => { setPassword(e.target.value); error && setError(null) }}
              placeholder="••••••••"
              className="w-full pl-9 pr-3 py-2.5 text-sm font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/25 focus:outline-none focus:border-gold/40" />
          </div>
        </label>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-2 mb-4 text-rose-400 text-xs font-mono">
            <AlertCircle size={13} className="flex-shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        <button
          type="submit" disabled={loading || !email || !password}
          className="w-full py-2.5 rounded-lg font-mono text-sm tracking-wide bg-gold-500/90 text-black font-semibold hover:bg-gold-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Giriş yapılıyor…</> : 'Giriş Yap'}
        </button>

        <p className="mt-5 text-[10px] font-mono text-white/25 text-center leading-relaxed">
          Erişim yalnızca yetkili RoomArt ekibine açıktır.<br />Hesap için sistem yöneticisine başvurun.
        </p>
      </motion.form>
    </div>
  )
}
