import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, TrendingUp, TrendingDown, Star, DollarSign } from 'lucide-react'
import { QUADRANT_META, ACTION_META, formatNumber, formatScore } from '../utils/helpers'

function CategoryRow({ category, isSelected, onClick }) {
  const qm = QUADRANT_META[category.bcg?.quadrant] || {}
  const am = ACTION_META[category.recommendation?.action] || {}
  const isPositive = category.trend_growth >= 0

  return (
    <motion.div
      layout
      onClick={() => onClick(category)}
      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 group border ${
        isSelected ? 'border-white/10 bg-white/8' : 'border-transparent hover:border-white/5 hover:bg-white/4'
      }`}
      style={isSelected ? { borderColor: qm.color + '30', background: qm.color + '08' } : {}}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Quadrant badge */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
        style={{ background: qm.bg, border: `1px solid ${qm.border}` }}
      >
        {qm.emoji}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-body font-medium text-white truncate">{category.category}</span>
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded tracking-wider hidden xl:inline"
            style={{ background: am.bg, color: am.color }}
          >
            {category.recommendation?.action}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-white/30">
          <span>S <b className="text-white/60">{formatScore(category.share_score)}</b></span>
          <span>G <b className="text-white/60">{formatScore(category.growth_score)}</b></span>
          <span>{category.product_count} SKU</span>
          {category.confidence && (
            <span title={`Güven: ${category.confidence}`}
              style={{ color: { low: '#EF4444', medium: '#F59E0B', high: '#10B981' }[category.confidence] || '#888' }}>●</span>
          )}
        </div>
      </div>

      {/* Trend */}
      <div className={`flex items-center gap-0.5 text-[11px] font-mono flex-shrink-0 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {isPositive ? '+' : ''}{category.trend_growth?.toFixed(1)}%
      </div>

      <ChevronRight size={12} className={`flex-shrink-0 text-white/20 transition-colors ${isSelected ? 'text-white/50' : 'group-hover:text-white/40'}`} />
    </motion.div>
  )
}

function CategoryDetail({ category }) {
  if (!category) return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div>
        <div className="text-4xl mb-3">📊</div>
        <p className="text-white/30 text-sm font-mono">Select a category to view details</p>
      </div>
    </div>
  )

  const qm = QUADRANT_META[category.bcg?.quadrant] || {}
  const am = ACTION_META[category.recommendation?.action] || {}
  const rec = category.recommendation || {}

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={category.id}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        transition={{ duration: 0.2 }}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {/* Category header */}
        <div className="rounded-xl p-4" style={{ background: qm.bg, border: `1px solid ${qm.border}` }}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[10px] font-mono tracking-widest" style={{ color: qm.color + '80' }}>CLASSIFICATION</p>
              <h3 className="font-display text-2xl tracking-wider text-white mt-0.5">{category.category}</h3>
            </div>
            <div className="text-right">
              <div className="text-3xl mb-1">{qm.emoji}</div>
              <span className="text-xs font-mono font-bold tracking-wider" style={{ color: qm.color }}>{qm.label}</span>
            </div>
          </div>
          <p className="text-[11px] text-white/50 font-mono">{qm.description || category.bcg?.description}</p>
        </div>

        {/* Score bars */}
        <div className="space-y-3">
          <ScoreBar label="Market Share Score" value={category.share_score} max={100} color={qm.color} />
          <ScoreBar label="Market Growth Score" value={category.growth_score} max={100} color={qm.color} />
          <ScoreBar label="Trend Score" value={category.trend_score} max={100} color="#06B6D4" />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Products', value: category.product_count, icon: '📦' },
            { label: 'Avg Price', value: `₺${Math.round(category.avg_price)?.toLocaleString('tr-TR')}`, icon: '💰' },
            { label: 'Avg Rating', value: category.avg_rating?.toFixed(1) + ' ★', icon: '⭐' },
            { label: 'Total Reviews', value: formatNumber(category.total_reviews), icon: '💬' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="bg-white/4 rounded-lg p-3 border border-white/5">
              <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">{icon} {label}</p>
              <p className="text-base font-display text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Strategic recommendation */}
        <div className="rounded-xl border p-4" style={{ background: am.bg + '80', borderColor: am.color + '30' }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Strategic Action</p>
              <p className="text-lg font-display tracking-wider mt-0.5" style={{ color: am.color }}>
                {rec.action}
              </p>
            </div>
            <div className={`text-[10px] font-mono px-2 py-1 rounded-md ${rec.priority === 'HIGH' ? 'bg-red-500/20 text-red-400' : rec.priority === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-white/40'}`}>
              {rec.priority} PRIORITY
            </div>
          </div>
          <p className="text-[11px] text-white/50">{rec.rationale}</p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function ScoreBar({ label, value, max, color }) {
  const pct = (value / max) * 100
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[10px] font-mono text-white/40">{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color }}>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}80, ${color})` }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

export default function CategoryPanel({ categories, selectedCategory, onSelectCategory }) {
  return (
    <div className="glass-card flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 flex-shrink-0">
        <div>
          <h2 className="font-display text-base tracking-[0.15em] text-white">CATEGORIES</h2>
          <p className="text-[10px] font-mono text-white/30">{categories?.length || 0} active lines</p>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row flex-1 overflow-hidden">
        {/* Category list */}
        <div className="xl:w-56 xl:border-r border-white/5 overflow-y-auto p-2 flex-shrink-0">
          <div className="space-y-0.5">
            {categories?.map(cat => (
              <CategoryRow
                key={cat.id}
                category={cat}
                isSelected={selectedCategory?.id === cat.id}
                onClick={onSelectCategory}
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <CategoryDetail category={selectedCategory} />
      </div>
    </div>
  )
}
