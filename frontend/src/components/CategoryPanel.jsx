import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, TrendingUp, TrendingDown, Star, DollarSign, ExternalLink, X } from 'lucide-react'
import { QUADRANT_META, ACTION_META, formatNumber, formatScore, formatCurrency, tone } from '../utils/helpers'
import { useIsLight } from '../hooks/useTheme'

// Matriste bir ürüne tıklanınca sağ panelde açılan ürün kartı (Trendyol linkli)
function ProductDetail({ product, onClose, onGoToProduct }) {
  const p = product
  const light = useIsLight()
  const qmB = QUADRANT_META[p.bcg_class] || { label: 'ATANMADI', emoji: '∅', color: '#6B7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' }
  const qm = { ...qmB, color: tone(qmB.color, light) }
  const am0 = ACTION_META[p.recommendation?.action] || {}
  const am = { ...am0, color: tone(am0.color, light) }

  // Ürün adı üzerine gelince görsel popup (portal, DOM-direct → sıfır re-render)
  const imgPopupRef = useRef(null)
  const showProductImg = (e) => {
    const el = imgPopupRef.current
    if (!el || !p.image) return
    const r = e.currentTarget.getBoundingClientRect()
    const W = 220, H = 235, vh = window.innerHeight
    el.style.left  = `${Math.max(8, r.left - W - 16)}px`
    el.style.top   = `${Math.min(Math.max(8, r.top - 20), vh - H - 8)}px`
    el.style.display = 'block'
  }
  const hideProductImg = () => { if (imgPopupRef.current) imgPopupRef.current.style.display = 'none' }

  return (
    <div className="relative z-20 flex-1 overflow-y-auto p-4 space-y-4">
      {/* Görsel hover popup portal — her zaman mount, display:none */}
      {p.image && typeof document !== 'undefined' && createPortal(
        <div ref={imgPopupRef}
          className="pointer-events-none rounded-lg border border-white/15 p-2 shadow-2xl backdrop-blur-xl"
          style={{ display: 'none', position: 'fixed', zIndex: 200, width: 220, background: 'var(--bg-secondary)' }}>
          <img src={p.image} alt={p.name}
            className="w-full h-[155px] object-contain rounded bg-white/5" loading="lazy" />
          <div className="text-[9px] font-mono text-white/50 mt-1.5 line-clamp-2">{p.name}</div>
        </div>,
        document.body
      )}
      <div className="rounded-xl p-4" style={{ background: qm.bg, border: `1px solid ${qm.border}` }}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-mono tracking-widest" style={{ color: qm.color + '80' }}>ÜRÜN · {p.category}</p>
            <h3 className="font-body text-base text-white mt-0.5 leading-snug"
              onMouseEnter={showProductImg} onMouseLeave={hideProductImg}
              title={p.image ? 'Üzerine gel → görseli gör' : ''}>
              {p.name}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 text-white/30 hover:text-white/70" title="Kapat"><X size={16} /></button>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-xs font-mono font-bold tracking-wider" style={{ color: qm.color }}>{qm.emoji} {qm.label}</span>
          {onGoToProduct && (
            <button type="button" onClick={() => onGoToProduct(p.id)}
              className="flex items-center gap-1 text-[10px] font-mono text-white/35 hover:text-gold-400 transition-colors"
              title="Ürün tablosunda filtrele">
              <ExternalLink size={11} /> tabloda gör
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <ScoreBar label="Market Share Score" value={p.share_score} max={100} color={qm.color} />
        <ScoreBar label="Market Growth Score" value={p.growth_score} max={100} color={qm.color} />
        <ScoreBar label="Composite Score" value={p.composite_score} max={100} color="#06B6D4" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Fiyat', value: formatCurrency(p.price), icon: '💰' },
          { label: 'Puan', value: (p.rating ? p.rating.toFixed(1) : '—') + ' ★', icon: '⭐' },
          { label: 'Değerlendirme', value: formatNumber(p.review_count), icon: '💬' },
          { label: 'Güven', value: p.confidence || '—', icon: '🎯' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-white/4 rounded-lg p-3 border border-white/5">
            <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">{icon} {label}</p>
            <p className="text-base font-display text-white mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {p.recommendation?.action && (
        <div className="rounded-xl border p-3" style={{ background: (am.bg || 'rgba(255,255,255,0.04)'), borderColor: (am.color || '#888') + '30' }}>
          <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">Strategic Action</p>
          <p className="text-lg font-display tracking-wider mt-0.5" style={{ color: am.color || '#fff' }}>{p.recommendation.action}</p>
          {p.recommendation.rationale && <p className="text-[11px] text-white/50 mt-1">{p.recommendation.rationale}</p>}
        </div>
      )}

      <a href={p.url || '#'} target="_blank" rel="noreferrer"
        onClick={(e) => { if (p.url) { e.preventDefault(); window.open(p.url, '_blank', 'noopener,noreferrer') } }}
        className="flex items-center justify-center gap-2 w-full rounded-lg border border-gold/40 text-gold py-2.5 text-xs font-mono tracking-wider hover:bg-gold/10 transition-all cursor-pointer">
        <ExternalLink size={14} /> TRENDYOL'DA AÇ
      </a>
    </div>
  )
}

function CategoryRow({ category, isSelected, onClick }) {
  const light = useIsLight()
  const qmB = QUADRANT_META[category.bcg?.quadrant] || {}
  const qm = { ...qmB, color: tone(qmB.color, light) }
  const am0 = ACTION_META[category.recommendation?.action] || {}
  const am = { ...am0, color: tone(am0.color, light) }
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

      {/* Info — kategori ADI + güven noktası ilk satırda; özet metrikleri ikinci satırda */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm font-body font-medium text-white truncate" title={category.category}>{category.category}</span>
          {category.confidence && (
            <span className="flex-shrink-0 text-[8px]" title={`Güven: ${category.confidence}`}
              style={{ color: tone({ low: '#EF4444', medium: '#F59E0B', high: '#10B981' }[category.confidence] || '#888', light) }}>●</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-white/30">
          <span className="px-1 py-0.5 rounded font-bold tracking-wider" style={{ background: am.bg, color: am.color }}>
            {category.recommendation?.action}
          </span>
          <span>S <b className="text-white/60">{formatScore(category.share_score)}</b></span>
          <span>G <b className="text-white/60">{formatScore(category.growth_score)}</b></span>
          <span>{category.product_count} SKU</span>
          <span className={`flex items-center gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
            {isPositive ? '+' : ''}{category.trend_growth?.toFixed(1)}%
          </span>
        </div>
      </div>

      {isSelected ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onClick(category) }}
          className="flex-shrink-0 text-white/50 hover:text-white" title="Filtreyi kaldır"><X size={13} /></button>
      ) : (
        <ChevronRight size={12} className="flex-shrink-0 text-white/20 group-hover:text-white/40 transition-colors" />
      )}
    </motion.div>
  )
}

function CategoryDetail({ category }) {
  const light = useIsLight()
  if (!category) return (
    <div className="flex-1 flex items-center justify-center text-center p-8">
      <div>
        <div className="text-4xl mb-3">📊</div>
        <p className="text-white/30 text-sm font-mono">Select a category to view details</p>
      </div>
    </div>
  )

  const qmB = QUADRANT_META[category.bcg?.quadrant] || {}
  const qm = { ...qmB, color: tone(qmB.color, light) }
  const am0 = ACTION_META[category.recommendation?.action] || {}
  const am = { ...am0, color: tone(am0.color, light) }
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

export default function CategoryPanel({ categories, selectedCategory, onSelectCategory, selectedProduct, onClearProduct, onGoToProduct }) {
  return (
    <div className="glass-card flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 flex-shrink-0">
        <div>
          <h2 className="font-display text-base tracking-[0.15em] text-white">CATEGORIES</h2>
          <p className="text-[10px] font-mono text-white/30">
            {categories?.length || 0} active lines · <span className="text-white/45">S</span>=Share <span className="text-white/45">G</span>=Growth · ●=güven
          </p>
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
                onClick={(c) => onSelectCategory(selectedCategory?.id === c.id ? null : c)}
              />
            ))}
          </div>
        </div>

        {/* Detail panel — ürün seçiliyse ürün kartı (Trendyol linkli), yoksa kategori detayı */}
        {selectedProduct
          ? <ProductDetail product={selectedProduct} onClose={onClearProduct} onGoToProduct={onGoToProduct} />
          : <CategoryDetail category={selectedCategory} />}
      </div>
    </div>
  )
}
