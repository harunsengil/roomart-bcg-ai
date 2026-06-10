import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QUADRANT_META, ACTION_META, formatScore } from '../utils/helpers'

const QUADRANT_LABELS = [
  { id: 'QUESTION_MARK', x: '25%', y: '25%', label: '❓ QUESTION MARKS', sub: 'High Growth · Low Share', color: '#3B82F6' },
  { id: 'STAR', x: '75%', y: '25%', label: '⭐ STARS', sub: 'High Growth · High Share', color: '#F59E0B' },
  { id: 'DOG', x: '25%', y: '75%', label: '🐕 DOGS', sub: 'Low Growth · Low Share', color: '#EF4444' },
  { id: 'CASH_COW', x: '75%', y: '75%', label: '🐄 CASH COWS', sub: 'Low Growth · High Share', color: '#10B981' },
]
const ACTIONS = ['ALL', 'INVEST', 'HARVEST', 'TEST', 'EXIT']
const PAD = 8
const SPAN = 100 - 2 * PAD
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function median(arr) {
  if (!arr.length) return 50
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function frac(v, thr) {
  if (v <= thr) return thr <= 0 ? 0.5 : (v / thr) * 0.5
  return thr >= 100 ? 0.5 : 0.5 + ((v - thr) / (100 - thr)) * 0.5
}
function jitter(id) {
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return [((h % 1000) / 1000 - 0.5) * 3.0, (((h >>> 10) % 1000) / 1000 - 0.5) * 3.0]
}
// Kabarcık boyutu = SATIŞ HACMİ (net adet) — klasik BCG "pazar büyüklüğü" kabarcığı.
// Alan-orantılı (yarıçap ∝ √adet) → görsel alan satışla orantılı, büyük satıcılar baskın çıkmaz.
// (Net Tahsilat %85-89 bandında sıkışık olduğu için boyut sinyali değil; kolon/tooltip'te kalır.)
function dotSize(p) {
  const u = p?.units || 0
  return 5 + clamp(Math.sqrt(u) * 1.25, 0, 13)
}

function ProductTooltip({ p }) {
  if (!p) return null
  const qm = QUADRANT_META[p.bcg_class] || {}
  const am = ACTION_META[p.recommendation?.action] || {}
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.12 }}
      className="pointer-events-none absolute z-50 w-60 rounded-xl border backdrop-blur-xl p-3 shadow-2xl"
      style={{ borderColor: (qm.color || '#fff') + '40', background: 'var(--bg-secondary)' }}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h4 className="text-white font-body font-medium text-xs leading-snug">{p.name}</h4>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider flex-shrink-0"
          style={{ background: qm.bg, color: qm.color, border: `1px solid ${qm.border}` }}>
          {qm.emoji} {qm.label}
        </span>
      </div>
      <p className="text-[9px] font-mono text-white/30 mb-2 truncate">{p.category}</p>
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {[['Share', p.share_score], ['Growth', p.growth_score], ['Score', p.composite_score]].map(([l, v]) => (
          <div key={l} className="bg-white/5 rounded-md p-1.5 text-center">
            <p className="text-[8px] font-mono text-white/30 uppercase">{l}</p>
            <p className="text-sm font-display text-white">{formatScore(v)}</p>
          </div>
        ))}
      </div>
      {((p.units ?? 0) > 0 || p.net_retention_pct != null || (p.risk_rate ?? 0) > 0) && (
        <div className="flex items-center justify-between gap-2 mb-2 text-[9px] font-mono text-white/40">
          {(p.units ?? 0) > 0 && <span title="Net satış adedi (kabarcık boyutu)">⬤ {p.units} adet</span>}
          {p.net_retention_pct != null && <span title="Net Tahsilat % (komisyon+promo sonrası)">Net %{Math.round(p.net_retention_pct)}</span>}
          {(p.risk_rate ?? 0) > 0 && <span className={p.risk_rate >= 20 ? 'text-rose-400' : ''}>İade %{Math.round(p.risk_rate)}</span>}
        </div>
      )}
      {p.recommendation?.action && (
        <div className="rounded-md px-2 py-1 text-center" style={{ background: am.bg || 'rgba(255,255,255,0.05)' }}>
          <span className="text-[11px] font-bold font-mono tracking-wider" style={{ color: am.color || '#fff' }}>
            {p.recommendation.action}
          </span>
        </div>
      )}
    </motion.div>
  )
}

export default function BCGMatrix({ products, categories, onSelectCategory, selectedCategory, onSelectProduct }) {
  const [tooltip, setTooltip] = useState({ visible: false, product: null, x: 0, y: 0 })
  const [zoom, setZoom] = useState(null)
  const [actionFilter, setActionFilter] = useState('ALL')
  const containerRef = useRef(null)

  const scored = (products || []).filter(
    p => p.share_score != null && p.growth_score != null
  )
  if (!scored.length) return null

  const shareThr = median(scored.map(p => p.share_score))
  const growthThr = median(scored.map(p => p.growth_score))
  const QRANGE = {
    STAR: { loS: shareThr, hiS: 100, loG: growthThr, hiG: 100 },
    QUESTION_MARK: { loS: 0, hiS: shareThr, loG: growthThr, hiG: 100 },
    CASH_COW: { loS: shareThr, hiS: 100, loG: 0, hiG: growthThr },
    DOG: { loS: 0, hiS: shareThr, loG: 0, hiG: growthThr },
  }

  // Filtreler: aksiyon çipi + seçili kategori + (zoom kadranı)
  const base = scored
    .filter(p => actionFilter === 'ALL' || p.recommendation?.action === actionFilter)
    .filter(p => !selectedCategory || p.category === selectedCategory.category)
  const shown = zoom ? base.filter(p => p.bcg_class === zoom) : base

  const posOf = (p) => {
    const [jx, jy] = jitter(p.id)
    if (zoom) {
      const r = QRANGE[zoom]
      const xf = r.hiS > r.loS ? (p.share_score - r.loS) / (r.hiS - r.loS) : 0.5
      const yf = r.hiG > r.loG ? (p.growth_score - r.loG) / (r.hiG - r.loG) : 0.5
      return [PAD + clamp(xf, 0, 1) * SPAN + jx, PAD + (1 - clamp(yf, 0, 1)) * SPAN + jy]
    }
    return [PAD + frac(p.share_score, shareThr) * SPAN + jx, PAD + (1 - frac(p.growth_score, growthThr)) * SPAN + jy]
  }

  const handleMouseEnter = (e, product) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    setTooltip({ visible: true, product, x: x > rect.width * 0.6 ? x - 250 : x + 14, y: y > rect.height * 0.5 ? y - 170 : y + 14 })
  }
  const clearTip = () => setTooltip({ visible: false, product: null, x: 0, y: 0 })

  const handlePlotClick = (e) => {
    if (zoom) { setZoom(null); return }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height
    const q = fx < 0.5 ? (fy < 0.5 ? 'QUESTION_MARK' : 'DOG') : (fy < 0.5 ? 'STAR' : 'CASH_COW')
    if (base.some(p => p.bcg_class === q)) setZoom(q)
  }

  const zoomMeta = zoom ? QUADRANT_META[zoom] : null

  return (
    <div className="glass-card p-5 h-full">
      <div className="relative z-20 flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg tracking-[0.15em] text-white">BCG MATRIX</h2>
          <p className="text-[10px] font-mono text-white/30 tracking-wider">
            {zoom
              ? `🔍 ${zoomMeta.label} · ${shown.length} ürün — boşluğa tıkla: geri`
              : `${shown.length}/${scored.length} ürün · ⬤ boyut = satış adedi · boş kadrana tıkla: yakınlaştır`}
            {selectedCategory && (
              <button onClick={(e) => { e.stopPropagation(); onSelectCategory(null) }}
                className="ml-2 text-gold-400 hover:text-gold-300">· {selectedCategory.category} ✕</button>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end flex-shrink-0">
          {ACTIONS.map(a => {
            const color = a === 'ALL' ? '#888' : (ACTION_META[a]?.color || '#888')
            const active = actionFilter === a
            return (
              <button key={a} type="button" onClick={() => setActionFilter(a)}
                className="px-2 py-0.5 text-[9px] font-mono rounded border transition-all"
                style={{ borderColor: active ? color : 'var(--border-subtle)', color: active ? color : 'var(--text-secondary)', background: active ? color + '15' : 'transparent' }}>
                {a}
              </button>
            )
          })}
        </div>
      </div>

      <div ref={containerRef} className={`relative ${zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
        style={{ paddingBottom: '55%' }} onClick={handlePlotClick}>
        <div className="absolute inset-0">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            {!zoom && (
              <>
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(120,124,150,0.22)" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(120,124,150,0.22)" strokeWidth="1" strokeDasharray="4 4" />
                <rect x="0" y="0" width="50%" height="50%" fill="rgba(59,130,246,0.04)" />
                <rect x="50%" y="0" width="50%" height="50%" fill="rgba(245,158,11,0.06)" />
                <rect x="0" y="50%" width="50%" height="50%" fill="rgba(239,68,68,0.04)" />
                <rect x="50%" y="50%" width="50%" height="50%" fill="rgba(16,185,129,0.04)" />
              </>
            )}
            {zoom && <rect x="0" y="0" width="100%" height="100%" fill={zoomMeta.color + '0c'} />}
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="rgba(120,124,150,0.5)" />
              </marker>
            </defs>
            <line x1="5%" y1="95%" x2="95%" y2="95%" stroke="rgba(120,124,150,0.5)" strokeWidth="1" markerEnd="url(#arrow)" />
            <line x1="5%" y1="95%" x2="5%" y2="5%" stroke="rgba(120,124,150,0.5)" strokeWidth="1" markerEnd="url(#arrow)" />
          </svg>

          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-white/30 tracking-widest uppercase pointer-events-none">
            MARKET SHARE SCORE →
          </div>
          <div className="absolute left-0 top-1/2 text-[9px] font-mono text-white/30 tracking-widest uppercase pointer-events-none"
            style={{ transform: 'rotate(-90deg) translateX(-50%)', transformOrigin: 'left center', whiteSpace: 'nowrap', left: '-2%' }}>
            ↑ MARKET GROWTH SCORE
          </div>

          {zoom ? (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center pointer-events-none">
              <p className="text-[10px] font-mono tracking-widest font-bold" style={{ color: zoomMeta.color + '90' }}>
                {zoomMeta.emoji} {zoomMeta.label} (yakınlaştırıldı)
              </p>
            </div>
          ) : (
            QUADRANT_LABELS.map(q => (
              <div key={q.id} className="absolute text-center pointer-events-none"
                style={{ left: q.x, top: q.y, transform: 'translate(-50%, -50%)' }}>
                <p className="text-[9px] font-mono tracking-widest font-bold" style={{ color: q.color + '60' }}>{q.label}</p>
                <p className="text-[8px] font-mono text-white/15">{q.sub}</p>
              </div>
            ))
          )}

          {shown.map((p) => {
            const [x, y] = posOf(p)
            const qm = QUADRANT_META[p.bcg_class] || {}
            const size = dotSize(p)
            return (
              <div key={p.id} className="absolute cursor-pointer"
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', zIndex: tooltip.product?.id === p.id ? 30 : 5 }}
                onMouseEnter={(e) => handleMouseEnter(e, p)}
                onMouseLeave={clearTip}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectProduct && onSelectProduct(p) // sağ panelde ürün kartı + Trendyol linki
                }}>
                <div className="rounded-full transition-all duration-150 hover:scale-[2.2]"
                  style={{
                    width: size, height: size,
                    background: `radial-gradient(circle at 35% 35%, ${qm.color}, ${qm.color}70)`,
                    border: `1px solid ${qm.color}`, opacity: 0.85, boxShadow: `0 0 5px ${qm.color}55`,
                  }} />
              </div>
            )
          })}
        </div>

        {tooltip.visible && (
          <div style={{ position: 'absolute', left: tooltip.x, top: tooltip.y, zIndex: 100 }}>
            <AnimatePresence><ProductTooltip p={tooltip.product} /></AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
