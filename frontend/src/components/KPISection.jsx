import { motion } from 'framer-motion'
import { Package, Grid3X3, Star, AlertTriangle, TrendingUp, BarChart3, Activity, Target } from 'lucide-react'
import { formatNumber } from '../utils/helpers'

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.4, ease: 'easeOut' } }),
}

function KPICard({ icon: Icon, label, value, sub, accent, index, pulse, tooltip }) {
  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="kpi-card group relative"
      style={{ '--accent': accent }}
    >
      {/* Not: önceki dekoratif accent katmanları (radial glow / köşe blob / alt h-px bar)
          kaldırıldı — gold accent kartlarda kalıcı sarı 'çizgi/glow' artefaktı yaratıyorlardı. */}

      {/* Hover popup (örn. TOTAL CATEGORIES → kategori adları) — native title yerine
          anında & temalı, güvenilir. */}
      {tooltip && (
        <div className="pointer-events-none absolute left-0 top-full mt-1 z-50 hidden group-hover:block
          max-w-xs rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono
          text-white/75 leading-relaxed shadow-2xl backdrop-blur-xl"
          style={{ background: 'var(--bg-secondary)' }}>
          {tooltip}
        </div>
      )}

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[10px] font-mono text-white/30 tracking-widest uppercase mb-2">{label}</p>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl tracking-wide text-white" style={{ color: accent }}>
              {formatNumber(value)}
            </span>
            {pulse && (
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
            )}
          </div>
          {sub && (
            <p className="text-[11px] text-white/40 mt-1 font-mono">{sub}</p>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ml-3"
          style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
        >
          <Icon size={18} style={{ color: accent }} />
        </div>
      </div>
    </motion.div>
  )
}

export default function KPISection({ kpis, categories }) {
  if (!kpis) return null

  const categoryNames = (categories || []).map(c => c.category).filter(Boolean).join(' · ')

  const cards = [
    { icon: Grid3X3, label: 'Total Categories', value: kpis.total_categories, sub: 'Active product lines', accent: '#F59E0B', pulse: false, tooltip: categoryNames || undefined },
    { icon: Package, label: 'Total Products', value: kpis.total_products, sub: 'Catalog SKUs', accent: '#8B5CF6', pulse: false },
    { icon: Target, label: 'Scored', value: kpis.scored_products ?? kpis.total_products, sub: 'BCG matrisinde', accent: '#A78BFA', pulse: false },
    { icon: Star, label: 'Star Products', value: kpis.star_products, sub: 'High growth & share', accent: '#F59E0B', pulse: true },
    { icon: BarChart3, label: 'Cash Cows', value: kpis.cash_cows, sub: 'Low growth · high share', accent: '#10B981', pulse: false },
    { icon: Activity, label: 'Question Marks', value: kpis.question_marks, sub: 'Requires decision', accent: '#3B82F6', pulse: true },
    { icon: AlertTriangle, label: 'Risk Products', value: kpis.risk_products, sub: 'Dogs + Question Marks', accent: '#EF4444', pulse: kpis.risk_products > 0 },
    { icon: TrendingUp, label: 'Avg Trend Score', value: kpis.avg_trend_score, sub: 'Google Trends index', accent: '#06B6D4', pulse: false },
    { icon: AlertTriangle, label: 'High Alerts', value: kpis.high_priority_alerts, sub: 'Require immediate action', accent: '#F97316', pulse: kpis.high_priority_alerts > 0 },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
      {cards.map((card, i) => (
        <KPICard key={card.label} {...card} index={i} />
      ))}
    </div>
  )
}
