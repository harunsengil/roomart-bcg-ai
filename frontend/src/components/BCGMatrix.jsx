import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QUADRANT_META, ACTION_META, formatScore } from '../utils/helpers'

const QUADRANT_LABELS = [
  { id: 'QUESTION_MARK', x: '25%', y: '25%', label: '❓ QUESTION MARKS', sub: 'High Growth · Low Share', color: '#3B82F6' },
  { id: 'STAR', x: '75%', y: '25%', label: '⭐ STARS', sub: 'High Growth · High Share', color: '#F59E0B' },
  { id: 'DOG', x: '25%', y: '75%', label: '🐕 DOGS', sub: 'Low Growth · Low Share', color: '#EF4444' },
  { id: 'CASH_COW', x: '75%', y: '75%', label: '🐄 CASH COWS', sub: 'Low Growth · High Share', color: '#10B981' },
]

const PAD = 8 // çizim alanı kenar boşluğu (%)
const SPAN = 100 - 2 * PAD

function median(arr) {
  if (!arr.length) return 50
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Parçalı normalize: medyan → 0.5 (eşik çizgisi tam ortada; nokta rengi görsel kadranla uyumlu)
function frac(v, thr) {
  if (v <= thr) return thr <= 0 ? 0.5 : (v / thr) * 0.5
  return thr >= 100 ? 0.5 : 0.5 + ((v - thr) / (100 - thr)) * 0.5
}

function ProductTooltip({ p }) {
  if (!p) return null
  const qm = QUADRANT_META[p.bcg_class] || {}
  const am = ACTION_META[p.recommendation?.action] || {}
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.12 }}
      className="pointer-events-none absolute z-50 w-60 rounded-xl border bg-navy-900/98 backdrop-blur-xl p-3 shadow-2xl"
      style={{ borderColor: (qm.color || '#fff') + '40' }}>
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

export default function BCGMatrix({ products, categories, onSelectCategory, selectedCategory }) {
  const [tooltip, setTooltip] = useState({ visible: false, product: null, x: 0, y: 0 })
  const containerRef = useRef(null)

  // Yalnız skorlanmış ürünler (DİĞER/atanmamış skorsuz → matriste yok)
  const scored = (products || []).filter(
    p => !p.is_unassigned && p.share_score != null && p.growth_score != null
  )
  if (!scored.length) return null

  // Göreli eşik = portföy medyanı (analyzer ile aynı mantık) → çizgiler 50%'de
  const shareThr = median(scored.map(p => p.share_score))
  const growthThr = median(scored.map(p => p.growth_score))

  const handleMouseEnter = (e, product) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const tipX = x > rect.width * 0.6 ? x - 250 : x + 14
    const tipY = y > rect.height * 0.5 ? y - 170 : y + 14
    setTooltip({ visible: true, product, x: tipX, y: tipY })
  }
  const clearTip = () => setTooltip({ visible: false, product: null, x: 0, y: 0 })

  return (
    <div className="glass-card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-lg tracking-[0.15em] text-white">BCG MATRIX</h2>
          <p className="text-[10px] font-mono text-white/30 tracking-wider">
            {scored.length} ürün · Relative Market Share vs Growth Score
          </p>
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(QUADRANT_META).map(([key, meta]) => (
            <div key={key} className="flex items-center gap-1.5 text-[10px] font-mono text-white/40">
              <div className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
              <span className="hidden xl:inline">{meta.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative" style={{ paddingBottom: '55%' }}>
        <div className="absolute inset-0">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
            <rect x="0" y="0" width="50%" height="50%" fill="rgba(59,130,246,0.04)" />
            <rect x="50%" y="0" width="50%" height="50%" fill="rgba(245,158,11,0.06)" />
            <rect x="0" y="50%" width="50%" height="50%" fill="rgba(239,68,68,0.04)" />
            <rect x="50%" y="50%" width="50%" height="50%" fill="rgba(16,185,129,0.04)" />
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.2)" />
              </marker>
            </defs>
            <line x1="5%" y1="95%" x2="95%" y2="95%" stroke="rgba(255,255,255,0.2)" strokeWidth="1" markerEnd="url(#arrow)" />
            <line x1="5%" y1="95%" x2="5%" y2="5%" stroke="rgba(255,255,255,0.2)" strokeWidth="1" markerEnd="url(#arrow)" />
          </svg>

          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-white/30 tracking-widest uppercase">
            MARKET SHARE SCORE →
          </div>
          <div className="absolute left-0 top-1/2 text-[9px] font-mono text-white/30 tracking-widest uppercase"
            style={{ transform: 'rotate(-90deg) translateX(-50%)', transformOrigin: 'left center', whiteSpace: 'nowrap', left: '-2%' }}>
            ↑ MARKET GROWTH SCORE
          </div>

          {QUADRANT_LABELS.map(q => (
            <div key={q.id} className="absolute text-center pointer-events-none"
              style={{ left: q.x, top: q.y, transform: 'translate(-50%, -50%)' }}>
              <p className="text-[9px] font-mono tracking-widest font-bold" style={{ color: q.color + '60' }}>{q.label}</p>
              <p className="text-[8px] font-mono text-white/15">{q.sub}</p>
            </div>
          ))}

          {/* Ürün noktaları */}
          {scored.map((p, i) => {
            const x = PAD + frac(p.share_score, shareThr) * SPAN
            const y = PAD + (1 - frac(p.growth_score, growthThr)) * SPAN
            const qm = QUADRANT_META[p.bcg_class] || {}
            const dimmed = selectedCategory && selectedCategory.category !== p.category
            const size = 9
            return (
              <div key={p.id} className="absolute cursor-pointer"
                style={{
                  left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)',
                  zIndex: tooltip.product?.id === p.id ? 30 : 5,
                }}
                onMouseEnter={(e) => handleMouseEnter(e, p)}
                onMouseLeave={clearTip}
                onClick={() => {
                  const cat = (categories || []).find(c => c.category === p.category)
                  if (cat) onSelectCategory(cat)
                }}>
                <div className="rounded-full transition-all duration-150 hover:scale-[2.2]"
                  style={{
                    width: size, height: size,
                    background: `radial-gradient(circle at 35% 35%, ${qm.color}, ${qm.color}70)`,
                    border: `1px solid ${qm.color}`,
                    opacity: dimmed ? 0.18 : 0.85,
                    boxShadow: `0 0 5px ${qm.color}55`,
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
