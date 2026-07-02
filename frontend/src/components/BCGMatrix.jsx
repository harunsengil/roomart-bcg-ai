import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QUADRANT_META, ACTION_META, formatScore } from '../utils/helpers'

// Quadrant labels at center of each dot-area quadrant: mid = PAD + 0.5*SPAN = 50
// Left-half center x = (PAD + 50) / 2 = 29%,  Right = (50 + PAD+SPAN) / 2 = 71%
// Top-half center y = (PAD + 50) / 2 = 29%,   Bottom = (50 + PAD+SPAN) / 2 = 71%
const QUADRANT_LABELS = [
  { id: 'QUESTION_MARK', x: '29%', y: '29%', label: '❓ QUESTION MARKS', sub: 'High Growth · Low Share', color: '#3B82F6' },
  { id: 'STAR',          x: '71%', y: '29%', label: '⭐ STARS',          sub: 'High Growth · High Share', color: '#F59E0B' },
  { id: 'DOG',           x: '29%', y: '71%', label: '🐕 DOGS',           sub: 'Low Growth · Low Share',  color: '#EF4444' },
  { id: 'CASH_COW',      x: '71%', y: '71%', label: '🐄 CASH COWS',      sub: 'Low Growth · High Share', color: '#10B981' },
]
const ACTIONS = ['ALL', 'INVEST', 'HARVEST', 'TEST', 'EXIT']
const PAD = 8
const SPAN = 100 - 2 * PAD  // 84
const MID = PAD + SPAN / 2  // 50  (quadrant divider, matches median threshold)
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
// Jitter azaltıldı (±1.5): median sınırına yakın noktalar karşı kadranda görünmesin.
function jitter(id) {
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return [((h % 1000) / 1000 - 0.5) * 1.5, (((h >>> 10) % 1000) / 1000 - 0.5) * 1.5]
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
      {p.image && (
        <div className="mb-2 -mt-0.5 rounded-lg overflow-hidden" style={{ height: 90, background: 'rgba(255,255,255,0.04)' }}>
          <img src={p.image} alt={p.name} className="w-full h-full object-contain" loading="lazy" />
        </div>
      )}
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
  const [highlightId, setHighlightId] = useState(null)
  const containerRef = useRef(null)

  const scored = (products || []).filter(p => p.share_score != null && p.growth_score != null)
  if (!scored.length) return null

  const shareThr = median(scored.map(p => p.share_score))
  const growthThr = median(scored.map(p => p.growth_score))

  const base = scored
    .filter(p => actionFilter === 'ALL' || p.recommendation?.action === actionFilter)
    .filter(p => !selectedCategory || p.category === selectedCategory.category)
  const shown = zoom ? base.filter(p => p.bcg_class === zoom) : base

  // Zoom modunda rank tabanlı konumlandırma: skoru benzer ürünler alta yığılmaz,
  // sıralama içindeki yerine göre alanın tamamına eşit dağıtılır.
  const zoomRanks = useMemo(() => {
    if (!zoom || !shown.length) return {}
    const byShare  = [...shown].sort((a, b) => a.share_score - b.share_score)
    const byGrowth = [...shown].sort((a, b) => a.growth_score - b.growth_score)
    const n = Math.max(1, shown.length - 1)
    const ranks = {}
    shown.forEach(p => {
      ranks[p.id] = {
        xr: byShare.findIndex(q => q.id === p.id) / n,
        yr: byGrowth.findIndex(q => q.id === p.id) / n,
      }
    })
    return ranks
  }, [zoom, shown])

  const posOf = (p) => {
    const [jx, jy] = jitter(p.id)
    if (zoom) {
      const r = zoomRanks[p.id] || { xr: 0.5, yr: 0.5 }
      return [
        PAD + clamp(r.xr * SPAN + jx, 3, SPAN - 3),
        PAD + clamp((1 - r.yr) * SPAN + jy, 3, SPAN - 3),
      ]
    }
    const xBase = PAD + frac(p.share_score, shareThr) * SPAN
    const yBase = PAD + (1 - frac(p.growth_score, growthThr)) * SPAN
    const isRight = p.bcg_class === 'STAR' || p.bcg_class === 'CASH_COW'
    const isTop   = p.bcg_class === 'STAR' || p.bcg_class === 'QUESTION_MARK'
    const xMin = p.bcg_class ? (isRight ? MID + 0.5 : PAD + 0.5) : PAD
    const xMax = p.bcg_class ? (isRight ? PAD + SPAN - 0.5 : MID - 0.5) : PAD + SPAN
    const yMin = p.bcg_class ? (isTop ? PAD + 0.5 : MID + 0.5) : PAD
    const yMax = p.bcg_class ? (isTop ? MID - 0.5 : PAD + SPAN - 0.5) : PAD + SPAN
    return [clamp(xBase + jx, xMin, xMax), clamp(yBase + jy, yMin, yMax)]
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
  const sortedZoom = useMemo(() =>
    [...shown].sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0)),
    [shown]
  )

  // ── Dots render (ortak, her iki layout'ta kullanılır) ────────────────────────
  const renderDots = () => shown.map(p => {
    const [x, y] = posOf(p)
    const qm = QUADRANT_META[p.bcg_class] || {}
    const size = dotSize(p)
    const isHL = highlightId === p.id
    return (
      <div key={p.id} className="absolute cursor-pointer"
        style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', zIndex: isHL ? 40 : (tooltip.product?.id === p.id ? 30 : 5) }}
        onMouseEnter={e => handleMouseEnter(e, p)}
        onMouseLeave={clearTip}
        onClick={e => { e.stopPropagation(); onSelectProduct?.(p) }}>
        <div className="rounded-full transition-all duration-150 hover:scale-[2.2]"
          style={{
            width: isHL ? size * 1.8 : size, height: isHL ? size * 1.8 : size,
            background: `radial-gradient(circle at 35% 35%, ${qm.color}, ${qm.color}70)`,
            border: `${isHL ? 2 : 1}px solid ${qm.color}`,
            opacity: isHL ? 1 : 0.85,
            boxShadow: isHL ? `0 0 12px ${qm.color}99` : `0 0 5px ${qm.color}55`,
          }} />
      </div>
    )
  })

  return (
    <div className="glass-card p-5 h-full flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="relative z-20 flex items-start justify-between mb-3 gap-3 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="font-display text-lg tracking-[0.15em] text-white">BCG MATRIX</h2>
          <p className="text-[10px] font-mono text-white/30 tracking-wider">
            {zoom
              ? `🔍 ${zoomMeta.label} · ${shown.length} ürün (sıraya göre dağıtıldı) — boşluğa tıkla: geri`
              : `${shown.length}/${scored.length} ürün · ⬤ boyut = satış adedi · boş kadrana tıkla: yakınlaştır`}
            {selectedCategory && (
              <button onClick={e => { e.stopPropagation(); onSelectCategory(null) }}
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

      {zoom ? (
        /* ── ZOOM LAYOUT: scatter sol + kaydırılabilir liste sağ ── */
        <div className="flex flex-1 min-h-0 gap-2">
          {/* Scatter alanı — flex ile kart içinde sabit yükseklikte */}
          <div ref={containerRef} className="relative flex-1 min-w-0 min-h-0 cursor-zoom-out overflow-hidden rounded-lg"
            style={{ background: (zoomMeta?.color || '#fff') + '05' }}
            onClick={handlePlotClick}>
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <rect x="0" y="0" width="100%" height="100%" fill={zoomMeta.color + '06'} />
              <defs>
                <marker id="arrow-z" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="rgba(120,124,150,0.5)" />
                </marker>
              </defs>
              <line x1={`${PAD}%`} y1={`${PAD + SPAN}%`} x2={`${PAD + SPAN + 2}%`} y2={`${PAD + SPAN}%`}
                stroke="rgba(120,124,150,0.4)" strokeWidth="1" markerEnd="url(#arrow-z)" />
              <line x1={`${PAD}%`} y1={`${PAD + SPAN}%`} x2={`${PAD}%`} y2={`${PAD - 2}%`}
                stroke="rgba(120,124,150,0.4)" strokeWidth="1" markerEnd="url(#arrow-z)" />
            </svg>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none">
              <p className="text-[10px] font-mono tracking-widest font-bold" style={{ color: zoomMeta.color + '80' }}>
                {zoomMeta.emoji} {zoomMeta.label} · skor sırası
              </p>
            </div>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-white/20 pointer-events-none">
              Pazar Payı Skoru →
            </div>
            <div className="absolute left-0 top-1/2 text-[8px] font-mono text-white/20 pointer-events-none"
              style={{ transform: 'rotate(-90deg) translateX(-50%)', transformOrigin: 'left center', whiteSpace: 'nowrap', left: '-1%' }}>
              ↑ Büyüme Skoru
            </div>
            {renderDots()}
            {tooltip.visible && (
              <div style={{ position: 'absolute', left: tooltip.x, top: tooltip.y, zIndex: 100 }}>
                <AnimatePresence><ProductTooltip p={tooltip.product} /></AnimatePresence>
              </div>
            )}
          </div>

          {/* Ürün listesi — flex-1 ile kart yüksekliğine kilitli, kendi içinde scroll */}
          <div className="w-52 flex-shrink-0 flex flex-col min-h-0 rounded-lg border overflow-hidden"
            style={{ borderColor: (zoomMeta?.color || '#fff') + '25', background: 'rgba(8,10,18,0.9)' }}>
            <div className="px-2.5 py-2 border-b flex-shrink-0 text-[9px] font-mono text-white/35"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              {shown.length} ürün · composite skora göre
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {sortedZoom.map((p, i) => (
                <div key={p.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer transition-colors border-b"
                  style={{
                    borderColor: 'rgba(255,255,255,0.04)',
                    background: highlightId === p.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: highlightId === p.id ? '#fff' : 'rgba(255,255,255,0.45)',
                  }}
                  onMouseEnter={e => { setHighlightId(p.id); handleMouseEnter(e, p) }}
                  onMouseLeave={() => { setHighlightId(null); clearTip() }}
                  onClick={e => { e.stopPropagation(); onSelectProduct?.(p) }}>
                  <span className="text-[9px] font-mono text-white/20 w-5 flex-shrink-0 text-right">{i + 1}</span>
                  <span className="text-[10px] font-mono truncate flex-1">{p.name}</span>
                  {p.composite_score != null && (
                    <span className="text-[9px] font-mono flex-shrink-0" style={{ color: zoomMeta?.color + '90' }}>
                      {Math.round(p.composite_score)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── NORMAL LAYOUT: tam genişlik scatter ── */
        <div ref={containerRef} className="bcg-plot relative cursor-zoom-in flex-shrink-0"
          style={{ paddingBottom: '55%' }} onClick={handlePlotClick}>
          <div className="absolute inset-0">
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(120,124,150,0.22)" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(120,124,150,0.22)" strokeWidth="1" strokeDasharray="4 4" />
              <rect x="0" y="0" width="50%" height="50%" fill="rgba(59,130,246,0.04)" />
              <rect x="50%" y="0" width="50%" height="50%" fill="rgba(245,158,11,0.06)" />
              <rect x="0" y="50%" width="50%" height="50%" fill="rgba(239,68,68,0.04)" />
              <rect x="50%" y="50%" width="50%" height="50%" fill="rgba(16,185,129,0.04)" />
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="rgba(120,124,150,0.5)" />
                </marker>
              </defs>
              <line x1={`${PAD}%`} y1={`${PAD + SPAN}%`} x2={`${PAD + SPAN + 2}%`} y2={`${PAD + SPAN}%`}
                stroke="rgba(120,124,150,0.5)" strokeWidth="1" markerEnd="url(#arrow)" />
              <line x1={`${PAD}%`} y1={`${PAD + SPAN}%`} x2={`${PAD}%`} y2={`${PAD - 2}%`}
                stroke="rgba(120,124,150,0.5)" strokeWidth="1" markerEnd="url(#arrow)" />
            </svg>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-center pointer-events-none">
              <div className="text-[9px] font-mono text-white/30 tracking-widest uppercase">MARKET SHARE SCORE →</div>
              <div className="text-[8px] font-mono text-white/18 tracking-wider">Pazar Payı Skoru</div>
            </div>
            <div className="absolute left-0 top-1/2 text-center pointer-events-none"
              style={{ transform: 'rotate(-90deg) translateX(-50%)', transformOrigin: 'left center', whiteSpace: 'nowrap', left: '-2%' }}>
              <div className="text-[9px] font-mono text-white/30 tracking-widest uppercase">↑ MARKET GROWTH SCORE</div>
              <div className="text-[8px] font-mono text-white/18 tracking-wider">Büyüme Skoru</div>
            </div>
            {QUADRANT_LABELS.map(q => (
              <div key={q.id} className="absolute text-center pointer-events-none"
                style={{ left: q.x, top: q.y, transform: 'translate(-50%, -50%)' }}>
                <p className="text-[9px] font-mono tracking-widest font-bold" style={{ color: q.color + '60' }}>{q.label}</p>
                <p className="text-[8px] font-mono text-white/15">{q.sub}</p>
              </div>
            ))}
            {renderDots()}
          </div>
          {tooltip.visible && (
            <div style={{ position: 'absolute', left: tooltip.x, top: tooltip.y, zIndex: 100 }}>
              <AnimatePresence><ProductTooltip p={tooltip.product} /></AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
