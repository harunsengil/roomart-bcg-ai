import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Lock, Mail, AlertCircle, CheckCircle2, KeyRound, ArrowLeft } from 'lucide-react'

// ── Animasyonlu arka plan — BCG matrisi temalı yüzen nokta haritası ──────────
// Noktalar kendi kadranlarında yavaşça yüzer; zaman zaman "sonar ping" pulse atar.
// Saf SVG + CSS animasyonu (framer-motion yok → 32 nokta için lightweight).
const DOTS = [
  // ⭐ STAR — sağ üst (yüksek pay, yüksek büyüme) — gold
  { id:'s1',x:74,y:14,r:6,c:'#F59E0B',dur:13,ox:3,oy:2,pulse:true  },
  { id:'s2',x:83,y:28,r:4,c:'#F59E0B',dur:16,ox:-2,oy:3             },
  { id:'s3',x:67,y:21,r:5,c:'#F59E0B',dur:11,ox:4,oy:-2             },
  { id:'s4',x:90,y:13,r:3,c:'#F59E0B',dur:19,ox:-3,oy:2             },
  { id:'s5',x:71,y:38,r:7,c:'#F59E0B',dur:14,ox:2,oy:-3,pulse:true  },
  { id:'s6',x:86,y:36,r:4,c:'#F59E0B',dur:12,ox:-1,oy:2             },
  { id:'s7',x:59,y:18,r:3,c:'#F59E0B',dur:17,ox:3,oy:1              },
  { id:'s8',x:79,y:43,r:5,c:'#F59E0B',dur:10,ox:-2,oy:-2            },
  // ❓ QUESTION MARK — sol üst — blue
  { id:'q1',x:21,y:17,r:4,c:'#3B82F6',dur:14,ox:-2,oy:3             },
  { id:'q2',x:36,y:11,r:3,c:'#3B82F6',dur:18,ox:2,oy:-1             },
  { id:'q3',x:11,y:31,r:5,c:'#3B82F6',dur:12,ox:-3,oy:2,pulse:true  },
  { id:'q4',x:27,y:39,r:4,c:'#3B82F6',dur:16,ox:1,oy:-3             },
  { id:'q5',x:43,y:26,r:3,c:'#3B82F6',dur: 9,ox:2,oy:2              },
  { id:'q6',x:18,y:43,r:6,c:'#3B82F6',dur:20,ox:-1,oy:-2            },
  { id:'q7',x:39,y:41,r:3,c:'#3B82F6',dur:13,ox:2,oy:1              },
  { id:'q8',x: 8,y:14,r:4,c:'#3B82F6',dur:15,ox:-2,oy:3             },
  // 🐄 CASH COW — sağ alt — green
  { id:'c1',x:71,y:63,r:7,c:'#10B981',dur:15,ox:2,oy:-3,pulse:true  },
  { id:'c2',x:86,y:73,r:4,c:'#10B981',dur:12,ox:-3,oy:2             },
  { id:'c3',x:61,y:79,r:5,c:'#10B981',dur:18,ox:3,oy:-1             },
  { id:'c4',x:79,y:57,r:3,c:'#10B981',dur:14,ox:-2,oy:3             },
  { id:'c5',x:92,y:86,r:6,c:'#10B981',dur:11,ox:1,oy:-2             },
  { id:'c6',x:64,y:89,r:4,c:'#10B981',dur:17,ox:-2,oy:1             },
  { id:'c7',x:83,y:64,r:3,c:'#10B981',dur:19,ox:2,oy:-1             },
  { id:'c8',x:55,y:69,r:5,c:'#10B981',dur:13,ox:-1,oy:2             },
  // 🐕 DOG — sol alt — red
  { id:'d1',x:14,y:69,r:3,c:'#EF4444',dur:16,ox:-2,oy:2             },
  { id:'d2',x:31,y:76,r:4,c:'#EF4444',dur:13,ox:2,oy:-2             },
  { id:'d3',x: 9,y:86,r:3,c:'#EF4444',dur:19,ox:-1,oy:3             },
  { id:'d4',x:43,y:61,r:4,c:'#EF4444',dur:12,ox:2,oy:-1,pulse:true  },
  { id:'d5',x:23,y:89,r:3,c:'#EF4444',dur:17,ox:-3,oy:1             },
  { id:'d6',x:37,y:81,r:5,c:'#EF4444',dur:15,ox:1,oy:-3             },
  { id:'d7',x:13,y:57,r:3,c:'#EF4444',dur:11,ox:-2,oy:2             },
  { id:'d8',x:46,y:86,r:4,c:'#EF4444',dur:18,ox:2,oy:-2             },
]

function BCGBackground() {
  return (
    <>
      {/* CSS animasyonları */}
      <style>{`
        @keyframes bcg-float {
          0%,100% { transform: translate(0px, 0px); }
          25%      { transform: translate(var(--ox), var(--oy)); }
          50%      { transform: translate(calc(var(--ox) * 1.5), 0px); }
          75%      { transform: translate(0px, var(--oy)); }
        }
        @keyframes bcg-pulse {
          0%   { r: var(--pr); opacity: 0.5; }
          60%  { r: calc(var(--pr) * 4); opacity: 0; }
          100% { r: calc(var(--pr) * 4); opacity: 0; }
        }
        @keyframes bcg-glow {
          0%,100% { opacity: 0.18; }
          50%     { opacity: 0.38; }
        }
      `}</style>

      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        {/* Kadran renk alanları */}
        <rect x="50%" y="0"    width="50%" height="50%" fill="#F59E0B" opacity="0.03" />
        <rect x="0"   y="0"    width="50%" height="50%" fill="#3B82F6" opacity="0.03" />
        <rect x="50%" y="50%"  width="50%" height="50%" fill="#10B981" opacity="0.03" />
        <rect x="0"   y="50%"  width="50%" height="50%" fill="#EF4444" opacity="0.025" />

        {/* Eksen çizgileri */}
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="5 7" />
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="5 7" />

        {/* Eksen ok başları */}
        <line x1="4%" y1="96%" x2="96%" y2="96%" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <polygon points="96%,95.2% 97%,96% 96%,96.8%" fill="rgba(255,255,255,0.15)" />
        <line x1="4%" y1="96%" x2="4%"  y2="4%"  stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <polygon points="3.2%,4% 4%,3% 4.8%,4%" fill="rgba(255,255,255,0.15)" />

        {/* Eksen etiketleri */}
        <text x="50%" y="98.5%" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono,monospace"
          fill="rgba(255,255,255,0.08)" letterSpacing="3">MARKET SHARE →</text>
        <text x="2%" y="50%" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono,monospace"
          fill="rgba(255,255,255,0.08)" letterSpacing="3"
          transform="rotate(-90, 18, 50%) translate(0, 0)">↑ GROWTH</text>

        {/* Kadran etiketleri */}
        <text x="75%" y="8%"  textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono,monospace" fill="rgba(245,158,11,0.12)" letterSpacing="2">⭐ STARS</text>
        <text x="25%" y="8%"  textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono,monospace" fill="rgba(59,130,246,0.12)" letterSpacing="2">❓ QUESTION</text>
        <text x="75%" y="96%" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono,monospace" fill="rgba(16,185,129,0.12)" letterSpacing="2">🐄 CASH COWS</text>
        <text x="25%" y="96%" textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono,monospace" fill="rgba(239,68,68,0.12)"  letterSpacing="2">🐕 DOGS</text>

        {/* Yüzen noktalar */}
        {DOTS.map(d => (
          <g key={d.id}>
            {/* Ana nokta */}
            <circle
              cx={`${d.x}%`} cy={`${d.y}%`} r={d.r}
              fill={d.c} opacity="0.22"
              style={{
                '--ox': `${d.ox}px`, '--oy': `${d.oy}px`,
                animation: `bcg-float ${d.dur}s ease-in-out infinite, bcg-glow ${d.dur * 0.7}s ease-in-out infinite`,
                transformOrigin: `${d.x}% ${d.y}%`,
              }}
            />
            {/* Sonar pulse (seçili noktalarda) */}
            {d.pulse && (
              <circle
                cx={`${d.x}%`} cy={`${d.y}%`} r={d.r}
                fill="none" stroke={d.c} strokeWidth="1"
                style={{
                  '--pr': `${d.r}px`,
                  animation: `bcg-pulse ${d.dur * 0.8}s ease-out infinite`,
                  animationDelay: `${d.dur * 0.3}s`,
                }}
              />
            )}
          </g>
        ))}
      </svg>
    </>
  )
}

// ── Giriş ekranı ─────────────────────────────────────────────────────────────
export default function LoginScreen({ login, error, setError, resetPassword, busy }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetMsg, setResetMsg] = useState(null)

  const loading = submitting || busy

  const switchMode = (m) => { setMode(m); setError(null); setResetMsg(null) }

  const onLogin = async (e) => {
    e.preventDefault()
    if (!email || !password || submitting) return
    setSubmitting(true)
    await login(email, password)
    setSubmitting(false)
  }

  const onReset = async (e) => {
    e.preventDefault()
    setResetMsg(null)
    if (!email) { setError('Lütfen e-posta adresinizi girin.'); return }
    setSubmitting(true)
    const ok = await resetPassword(email)
    setSubmitting(false)
    if (ok) setResetMsg('Parola sıfırlama bağlantısı e-postanıza gönderildi. Gelen kutunuzu (ve spam klasörünü) kontrol edin.')
  }

  const inputCls = 'w-full pl-9 pr-3 py-2.5 text-sm font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/25 focus:outline-none focus:border-gold/40'

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center gap-8 px-4 overflow-hidden"
      style={{ background: 'var(--bg-primary, #0a0f1e)' }}>

      {/* ── Animasyonlu arka plan ── */}
      <BCGBackground />

      {/* Scan line efekti */}
      <div className="scan-line" />

      {/* ── İçerik (z-index ile üstte) ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="text-center relative z-10">
        <div className="font-display text-5xl tracking-[0.3em] text-white mb-1">ROOMART</div>
        <div className="font-display text-xl tracking-[0.5em] text-gold-400">BCG INTELLIGENCE</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-sm rounded-2xl border border-white/10 p-7 shadow-2xl relative z-10"
        style={{ background: 'rgba(10,15,30,0.82)', backdropFilter: 'blur(20px)' }}>

        <div className="flex items-center gap-2 mb-6 text-white/70">
          {mode === 'login'
            ? <><Lock size={15} className="text-gold-400" /><span className="font-mono text-xs tracking-widest uppercase">Yetkili Girişi</span></>
            : <><KeyRound size={15} className="text-gold-400" /><span className="font-mono text-xs tracking-widest uppercase">Parola Sıfırlama</span></>}
        </div>

        <AnimatePresence mode="wait">
          {mode === 'login' ? (
            <motion.form key="login"
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }} onSubmit={onLogin}>
              <label className="block mb-3">
                <span className="text-[11px] font-mono text-white/40 mb-1.5 block">E-POSTA</span>
                <div className="relative">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input type="email" value={email} autoFocus autoComplete="email"
                    onChange={(e) => { setEmail(e.target.value); error && setError(null) }}
                    placeholder="ad@roomart.com" className={inputCls} />
                </div>
              </label>

              <label className="block mb-5">
                <span className="text-[11px] font-mono text-white/40 mb-1.5 block">ŞİFRE</span>
                <div className="relative">
                  <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input type="password" value={password} autoComplete="current-password"
                    onChange={(e) => { setPassword(e.target.value); error && setError(null) }}
                    placeholder="••••••••" className={inputCls} />
                </div>
              </label>

              {error && (
                <div className="flex items-center gap-2 mb-4 text-rose-400 text-xs font-mono">
                  <AlertCircle size={13} className="flex-shrink-0" /><span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading || !email || !password}
                className="w-full py-2.5 rounded-lg font-mono text-sm tracking-wide bg-gold-500/90 text-black font-semibold hover:bg-gold-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Giriş yapılıyor…</> : 'Giriş Yap'}
              </button>

              <button type="button" onClick={() => switchMode('reset')} disabled={loading}
                className="w-full mt-3 text-[11px] font-mono text-white/40 hover:text-gold-400 transition-colors disabled:opacity-40">
                Şifremi unuttum
              </button>
            </motion.form>
          ) : (
            <motion.form key="reset"
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }} onSubmit={onReset}>
              <p className="text-[11px] font-mono text-white/45 mb-4 leading-relaxed">
                Hesabınızın e-posta adresini girin; size yeni bir parola belirlemeniz için sıfırlama bağlantısı gönderelim.
              </p>

              <label className="block mb-5">
                <span className="text-[11px] font-mono text-white/40 mb-1.5 block">E-POSTA</span>
                <div className="relative">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input type="email" value={email} autoFocus autoComplete="email"
                    onChange={(e) => { setEmail(e.target.value); error && setError(null); resetMsg && setResetMsg(null) }}
                    placeholder="ad@roomart.com" className={inputCls} />
                </div>
              </label>

              {error && (
                <div className="flex items-center gap-2 mb-4 text-rose-400 text-xs font-mono">
                  <AlertCircle size={13} className="flex-shrink-0" /><span>{error}</span>
                </div>
              )}

              {resetMsg && (
                <div className="flex items-start gap-2 mb-4 text-emerald-400 text-xs font-mono">
                  <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" /><span>{resetMsg}</span>
                </div>
              )}

              <button type="submit" disabled={loading || !email}
                className="w-full py-2.5 rounded-lg font-mono text-sm tracking-wide bg-gold-500/90 text-black font-semibold hover:bg-gold-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Gönderiliyor…</> : 'Parolamı Sıfırla'}
              </button>

              <button type="button" onClick={() => switchMode('login')} disabled={loading}
                className="w-full mt-3 text-[11px] font-mono text-white/40 hover:text-gold-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5">
                <ArrowLeft size={11} /> Girişe dön
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <p className="mt-5 text-[10px] font-mono text-white/25 text-center leading-relaxed">
          Erişim yalnızca yetkili RoomArt ekibine açıktır.<br />Hesap için sistem yöneticisine başvurun.
        </p>
      </motion.div>
    </div>
  )
}
