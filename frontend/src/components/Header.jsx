import { useState, useEffect } from 'react'
import { Monitor, RefreshCw, Maximize2, Minimize2, Wifi, Sun, Moon } from 'lucide-react'

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function Header({ lastUpdated, onRefresh, isKiosk, onToggleKiosk, loading, theme, onToggleTheme }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const isDark = theme === 'dark'

  return (
    <header className="themed-header flex-shrink-0 z-50 border-b backdrop-blur-xl transition-all duration-300">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3">

        {/* Logo */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gold-500/10 border border-gold-500/30 flex items-center justify-center">
              <span className="font-display text-gold-400 text-lg tracking-widest">RA</span>
            </div>
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-navy-950 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-xl tracking-[0.15em] sm:tracking-[0.2em] text-white leading-none truncate">
              ROOMART <span className="text-gold-400 sm:ml-2">BCG INTELLIGENCE</span>
            </h1>
            <p className="hidden sm:block text-[10px] text-white/30 font-mono tracking-widest uppercase mt-0.5">
              Market Intelligence Platform v2.0
            </p>
          </div>
        </div>

        {/* Center: clock */}
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-400 tracking-widest">LIVE</span>
          </div>
          <div className="text-center">
            <div className="font-mono text-white/80 text-sm tracking-wider">{timeStr}</div>
            <div className="text-[10px] text-white/30 font-mono">{dateStr}</div>
          </div>
          {lastUpdated && (
            <div className="text-[10px] font-mono text-white/30">
              <div>LAST SYNC</div>
              <div className="text-white/50">{formatDateTime(lastUpdated)}</div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
            <Wifi size={11} className="text-emerald-400" />
            <span className="text-[10px] font-mono text-emerald-400 tracking-wider">CONNECTED</span>
          </div>

          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            title={isDark ? 'Light Mode' : 'Dark Mode'}
            className="p-2 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 hover:border-gold-500/30 transition-all group relative"
          >
            {isDark
              ? <Sun size={14} className="text-white/50 group-hover:text-gold-400 transition-colors" />
              : <Moon size={14} className="text-white/50 group-hover:text-gold-400 transition-colors" />
            }
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-mono bg-black/80 text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {isDark ? 'LIGHT' : 'DARK'}
            </span>
          </button>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 hover:border-gold-500/30 transition-all group"
          >
            <RefreshCw size={14} className={`text-white/50 group-hover:text-gold-400 transition-colors ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onToggleKiosk}
            className="p-2 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 hover:border-gold-500/30 transition-all group"
          >
            {isKiosk
              ? <Minimize2 size={14} className="text-gold-400" />
              : <Maximize2 size={14} className="text-white/50 group-hover:text-gold-400 transition-colors" />
            }
          </button>

          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gold-500/10 border border-gold-500/20">
            <Monitor size={11} className="text-gold-400" />
            <span className="text-[10px] font-mono text-gold-400 tracking-wider">1920×1080</span>
          </div>
        </div>
      </div>

      {/* Loading progress bar — YALNIZ loading=true iken render edilir (track dahil),
          yüklenmiyorken hiç çizgi kalmaz. */}
      {loading && (
        <div className="relative h-px overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />
          <div
            className="absolute top-0 left-0 h-full bg-gold-400"
            style={{ width: '40%', animation: 'headerSweep 1.2s ease-in-out infinite' }}
          />
        </div>
      )}
      <style>{`
        @keyframes headerSweep {
          0%   { transform: translateX(-100%); opacity: 0.9; }
          50%  { opacity: 1; }
          100% { transform: translateX(350%); opacity: 0; }
        }
      `}</style>
    </header>
  )
}
