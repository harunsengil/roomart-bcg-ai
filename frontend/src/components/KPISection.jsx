import { motion } from 'framer-motion'
import { Package, Grid3X3, Star, AlertTriangle, TrendingUp, BarChart3, Activity } from 'lucide-react'
import { formatNumber } from '../utils/helpers'

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.4, ease: 'easeOut' } }),
}

function KPICard({ icon: Icon, label, value, sub, accent, index, pulse }) {
  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="kpi-card group"
      style={{ '--accent': accent }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle at 50% 0%, ${accent}15 0%, transparent 70%)` }}
      />

      {/* Corner accent */}
      <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-xl pointer-events-none">
        <div
          className="absolute -top-8 -right-8 w-16 h-16 rounded-full opacity-20"
          style={{ background: accent }}
        />
      </div>

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

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 h-px rounded-b-xl" style={{ background: `linear-gradient(90deg, transparent, ${accent}50, transparent)` }} />
    </motion.div>
  )
}

export default function KPISection({ kpis }) {
  if (!kpis) return null

  const cards = [
    { icon: Grid3X3, label: 'Total Categories', value: kpis.total_categories, sub: 'Active product lines', accent: '#F59E0B', pulse: false },
    { icon: Package, label: 'Total Products', value: kpis.total_products, sub: 'Monitored SKUs', accent: '#8B5CF6', pulse: false },
    { icon: Star, label: 'Star Products', value: kpis.star_products, sub: 'High growth & share', accent: '#F59E0B', pulse: true },
    { icon: BarChart3, label: 'Cash Cows', value: kpis.cash_cows, sub: 'Stable revenue generators', accent: '#10B981', pulse: false },
    { icon: Activity, label: 'Question Marks', value: kpis.question_marks, sub: 'Requires decision', accent: '#3B82F6', pulse: true },
    { icon: AlertTriangle, label: 'Risk Products', value: kpis.risk_products, sub: 'Dogs + Question Marks', accent: '#EF4444', pulse: kpis.risk_products > 0 },
    { icon: TrendingUp, label: 'Avg Trend Score', value: kpis.avg_trend_score, sub: 'Google Trends index', accent: '#06B6D4', pulse: false },
    { icon: AlertTriangle, label: 'High Alerts', value: kpis.high_priority_alerts, sub: 'Require immediate action', accent: '#F97316', pulse: kpis.high_priority_alerts > 0 },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {cards.map((card, i) => (
        <KPICard key={card.label} {...card} index={i} />
      ))}
    </div>
  )
}
