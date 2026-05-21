import { useState } from 'react'
import { ACTION_COLORS, BCG_CONFIG, formatCurrency, formatScore } from '../utils/helpers'

export default function RecommendationsPanel({ products }) {
  const [sortBy, setSortBy] = useState('priority')
  const [actionFilter, setActionFilter] = useState('ALL')

  const topProducts = products
    .filter(p => p.recommendation?.action !== undefined)
    .filter(p => actionFilter === 'ALL' || p.recommendation.action === actionFilter)
    .sort((a, b) => {
      if (sortBy === 'priority') return a.recommendation.priority - b.recommendation.priority
      if (sortBy === 'growth') return b.growth_score - a.growth_score
      if (sortBy === 'share') return b.share_score - a.share_score
      return b.revenue - a.revenue
    })
    .slice(0, 15)

  const actions = [...new Set(products.map(p => p.recommendation?.action).filter(Boolean))]
  const actionCounts = {}
  actions.forEach(a => {
    actionCounts[a] = products.filter(p => p.recommendation?.action === a).length
  })

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-white font-semibold">AI Strategy Recommendations</h2>
          <p className="text-xs text-white/40 font-mono mt-0.5">Automated decision engine output</p>
        </div>
        <div className="flex gap-2">
          {['priority', 'growth', 'share', 'revenue'].map(s => (
            <button key={s}
              onClick={() => setSortBy(s)}
              className="px-2 py-1 text-xs font-mono rounded border transition-all"
              style={{
                borderColor: sortBy === s ? '#d4a017' : 'rgba(255,255,255,0.1)',
                color: sortBy === s ? '#d4a017' : 'rgba(255,255,255,0.4)',
              }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Action summary */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActionFilter('ALL')}
          className="px-3 py-1 text-xs font-mono rounded-full border transition-all"
          style={{
            borderColor: actionFilter === 'ALL' ? '#888' : 'rgba(255,255,255,0.1)',
            color: actionFilter === 'ALL' ? '#ccc' : 'rgba(255,255,255,0.4)',
          }}>
          ALL ({products.length})
        </button>
        {actions.map(action => (
          <button key={action}
            onClick={() => setActionFilter(action)}
            className="px-3 py-1 text-xs font-mono rounded-full border transition-all"
            style={{
              borderColor: actionFilter === action ? ACTION_COLORS[action] : 'rgba(255,255,255,0.1)',
              color: actionFilter === action ? ACTION_COLORS[action] : 'rgba(255,255,255,0.4)',
              background: actionFilter === action ? `${ACTION_COLORS[action]}15` : 'transparent',
            }}>
            {action} ({actionCounts[action]})
          </button>
        ))}
      </div>

      {/* Product list */}
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {topProducts.map((p, i) => {
          const cfg = BCG_CONFIG[p.bcg_class] || {}
          const actionColor = ACTION_COLORS[p.recommendation.action] || '#888'

          return (
            <div key={p.id} className="flex items-center gap-4 p-3 rounded-lg border transition-all hover:border-white/20"
              style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              
              <div className="w-6 text-center text-xs font-mono text-white/20">{i + 1}</div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-white font-medium truncate">{p.name}</p>
                  <span className="text-xs font-mono flex-shrink-0" style={{ color: cfg.color }}>{cfg.icon}</span>
                </div>
                <p className="text-xs text-white/40 font-mono truncate">{p.category} · {p.subcategory}</p>
              </div>

              <div className="hidden md:flex items-center gap-4 text-xs font-mono flex-shrink-0">
                <div className="text-center">
                  <div className="text-white/30 text-xs">Share</div>
                  <div className="text-white">{formatScore(p.share_score)}</div>
                </div>
                <div className="text-center">
                  <div className="text-white/30 text-xs">Growth</div>
                  <div className="text-white">{formatScore(p.growth_score)}</div>
                </div>
                <div className="text-center">
                  <div className="text-white/30 text-xs">Revenue</div>
                  <div className="text-white">{formatCurrency(p.revenue)}</div>
                </div>
              </div>

              <div className="flex-shrink-0">
                <span className="px-2 py-1 text-xs font-mono rounded-full"
                  style={{ background: `${actionColor}20`, color: actionColor, border: `1px solid ${actionColor}30` }}>
                  {p.recommendation.action}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* AI insight box */}
      <div className="p-4 rounded-lg border border-gold/20 bg-gold/5">
        <p className="text-xs font-mono text-gold/70 mb-1">⚡ AI INSIGHT</p>
        <p className="text-sm text-white/70 leading-relaxed">
          Portfolio analysis shows <span className="text-gold">
            {actionCounts['INVEST'] || 0} high-priority investment opportunities
          </span>. Consider reallocating budget from{' '}
          <span className="text-red-400">{actionCounts['EXIT'] || 0} exit candidates</span>{' '}
          to Star and rising Question Mark products for maximum portfolio ROI.
        </p>
      </div>
    </div>
  )
}
