import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QUADRANT_META, ACTION_META, formatScore } from '../utils/helpers'

const QUADRANT_LABELS = [
  { id: 'QUESTION_MARK', x: '25%', y: '25%', label: '❓ QUESTION MARKS', sub: 'High Growth · Low Share', color: '#3B82F6' },
  { id: 'STAR', x: '75%', y: '25%', label: '⭐ STARS', sub: 'High Growth · High Share', color: '#F59E0B' },
  { id: 'DOG', x: '25%', y: '75%', label: '🐕 DOGS', sub: 'Low Growth · Low Share', color: '#EF4444' },
  { id: 'CASH_COW', x: '75%', y: '75%', label: '🐄 CASH COWS', sub: 'Low Growth · High Share', color: '#10B981' },
]

function Tooltip({ category, visible }) {
  if (!visible || !category) return null
  const qm = QUADRANT_META[category.bcg?.quadrant] || {}
  const am = ACTION_META[category.recommendation?.action] || {}
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}
        className="pointer-events-none absolute z-50 w-64 rounded-xl border bg-navy-900/98 backdrop-blur-xl p-4 shadow-2xl"
        style={{ borderColor: (qm.color || '#fff') + '40' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-mono text-white/30 tracking-widest uppercase">{category.slug}</p>
            <h4 className="text-white font-body font-semibold text-sm mt-0.5">{category.category}</h4>
          </div>
          <div className="px-2 py-1 rounded-md text-[10px] font-mono font-bold tracking-wider"
            style={{ background: qm.bg, color: qm.color, border: `1px solid ${qm.border}` }}>
            {qm.label}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: 'Market Share', value: formatScore(category.share_score) },
            { label: 'Growth Score', value: formatScore(category.growth_score) },
            { label: 'Products', value: category.product_count },
            { label: 'Reviews', value: ((category.total_reviews || 0) / 1000).toFixed(1) + 'K' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/5 rounded-lg p-2">
              <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">{label}</p>
              <p className="text-lg font-display text-white">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg px-3 py-2 flex items-center justify-between"
          style={{ background: am.bg || 'rgba(255,255,255,0.05)' }}>
          <div>
            <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Recommendation</p>
            <p className="text-sm font-bold font-mono tracking-wider mt-0.5" style={{ color: am.color || '#fff' }}>
              {category.recommendation?.action}
            </p>
          </div>
          <div className="text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.05)', color: category.recommendation?.priority === 'HIGH' ? '#EF4444' : '#F59E0B' }}>
            {category.recommendation?.priority}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function BCGMatrix({ categories, onSelectCategory, selectedCategory }) {
  const [tooltip, setTooltip] = useState({ visible: false, category: null, x: 0, y: 0 })
  const containerRef = useRef(null)
  if (!categories?.length) return null

  const handleMouseEnter = (e, category) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const tipX = x > rect.width * 0.6 ? x - 270 : x + 16
    const tipY = y > rect.height * 0.5 ? y - 200 : y + 16
    setTooltip({ visible: true, category, x: tipX, y: tipY })
  }

  return (
    <div className="glass-card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-lg tracking-[0.15em] text-white">BCG MATRIX</h2>
          <p className="text-[10px] font-mono text-white/30 tracking-wider">Relative Market Share vs Growth Score</p>
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

          {(() => {
            const shareScores = categories.map(c => c.share_score)
            const growthScores = categories.map(c => c.growth_score)
            const shareMin = Math.min(...shareScores), shareMax = Math.max(...shareScores)
            const growthMin = Math.min(...growthScores), growthMax = Math.max(...growthScores)
            const shareRange = shareMax - shareMin || 1
            const growthRange = growthMax - growthMin || 1
            return categories.map((cat, i) => {
              const x = ((cat.share_score - shareMin) / shareRange) * 78 + 11
              const y = (1 - (cat.growth_score - growthMin) / growthRange) * 78 + 11
              const qm = QUADRANT_META[cat.bcg?.quadrant] || {}
              const isSelected = selectedCategory?.id === cat.id
              const bubbleSize = Math.max(28, Math.min(56, (cat.product_count || 15) * 1.5))
              return (
              <motion.div key={cat.id} className="absolute cursor-pointer"
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', zIndex: isSelected ? 20 : 10 }}
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 200 }}
                whileHover={{ scale: 1.15, zIndex: 30 }}
                onClick={() => onSelectCategory(cat)}
                onMouseEnter={(e) => handleMouseEnter(e, cat)}
                onMouseLeave={() => setTooltip({ visible: false, category: null, x: 0, y: 0 })}>
                {(cat.bcg?.quadrant === 'STAR' || cat.growth_score > 70) && (
                  <div className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: 'transparent', border: `1px solid ${qm.color}`, opacity: 0.4, animationDuration: '2s' }} />
                )}
                <div className="rounded-full flex items-center justify-center font-mono text-[9px] font-bold text-white transition-all duration-200 relative"
                  style={{ width: bubbleSize, height: bubbleSize,
                    background: `radial-gradient(circle at 35% 35%, ${qm.color}80, ${qm.color}30)`,
                    border: `2px solid ${isSelected ? qm.color : (qm.color || '#fff') + '60'}`,
                    boxShadow: isSelected ? `0 0 20px ${qm.color}60` : `0 0 8px ${qm.color}30` }}>
                  <span className="text-[8px] leading-tight text-center px-0.5">
                    {cat.category.split(' ').map(w => w[0]).join('').slice(0, 3)}
                  </span>
                </div>
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <span className="text-[8px] font-mono text-white/50">{cat.category}</span>
                </div>
              </motion.div>
              )
            })
          })()}
        </div>

        {tooltip.visible && (
          <div style={{ position: 'absolute', left: tooltip.x, top: tooltip.y, zIndex: 100 }}>
            <Tooltip category={tooltip.category} visible={tooltip.visible} />
          </div>
        )}
      </div>
    </div>
  )
}
