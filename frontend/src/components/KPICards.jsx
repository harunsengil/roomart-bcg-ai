import { BCG_CONFIG } from '../utils/helpers'

function KPICard({ label, value, sub, color, icon, trend }) {
  return (
    <div className="card card-glow p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <p className="text-xs font-mono text-white/40 tracking-widest uppercase">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <div>
        <p className="text-3xl font-display font-bold" style={{ color }}>{value}</p>
        {sub && <p className="text-xs text-white/50 mt-1 font-mono">{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: trend > 0 ? '#00ff88' : '#ff6666' }}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </span>
          <span className="text-xs text-white/30">vs prev. period</span>
        </div>
      )}
    </div>
  )
}

export default function KPICards({ metadata }) {
  if (!metadata) return null

  const cards = [
    {
      label: 'Total Products',
      value: metadata.total_products,
      sub: `${metadata.stars + metadata.cash_cows} profitable`,
      color: '#e8eaf0',
      icon: '📦',
    },
    {
      label: 'Star Products',
      value: metadata.stars,
      sub: `${((metadata.stars / metadata.total_products) * 100).toFixed(0)}% of portfolio`,
      color: BCG_CONFIG.STAR.color,
      icon: '⭐',
      trend: 12.5,
    },
    {
      label: 'Cash Cows',
      value: metadata.cash_cows,
      sub: 'Revenue generators',
      color: BCG_CONFIG.CASH_COW.color,
      icon: '💰',
      trend: -3.2,
    },
    {
      label: 'Question Marks',
      value: metadata.question_marks,
      sub: 'Investment candidates',
      color: BCG_CONFIG.QUESTION_MARK.color,
      icon: '❓',
      trend: 8.1,
    },
    {
      label: 'Risk Products',
      value: metadata.dogs,
      sub: 'Require review',
      color: '#ff6666',
      icon: '⚠️',
      trend: -5.4,
    },
    {
      label: 'Portfolio Score',
      value: `${metadata.avg_portfolio_score}`,
      sub: 'Composite BCG index',
      color: '#d4a017',
      icon: '📊',
      trend: 2.8,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c, i) => (
        <KPICard key={i} {...c} />
      ))}
    </div>
  )
}
