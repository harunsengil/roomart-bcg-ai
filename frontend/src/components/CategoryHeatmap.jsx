import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { formatCurrency } from '../utils/helpers'

const HEALTH_COLORS = { STRONG: '#00ff88', MIXED: '#ffc800', WEAK: '#ff6666' }

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="card p-3 text-xs">
      <p className="font-display text-white text-sm">{label}</p>
      <div className="mt-2 space-y-1 font-mono text-white/70">
        <div>Growth Score: <span className="text-white">{d?.avg_growth_score}</span></div>
        <div>Share Score: <span className="text-white">{d?.avg_share_score}</span></div>
        <div>Revenue: <span className="text-white">{formatCurrency(d?.total_revenue)}</span></div>
        <div>Products: <span className="text-white">{d?.product_count}</span></div>
      </div>
    </div>
  )
}

export default function CategoryHeatmap({ categorySummary }) {
  if (!categorySummary?.length) return null

  const sorted = [...categorySummary].sort((a, b) => b.avg_growth_score - a.avg_growth_score)

  return (
    <div className="card p-6 space-y-4">
      <div>
        <h2 className="font-display text-xl text-white font-semibold">Category Performance</h2>
        <p className="text-xs text-white/40 font-mono mt-0.5">Ranked by growth score</p>
      </div>

      {/* Growth Score Chart */}
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]}
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false} tickLine={false}
            />
            <YAxis type="category" dataKey="category" width={80}
              tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="avg_growth_score" radius={[0, 4, 4, 0]} name="Growth Score">
              {sorted.map((entry, i) => (
                <Cell key={i} fill={HEALTH_COLORS[entry.health] || '#888'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sorted.slice(0, 8).map((cat, i) => {
          const hColor = HEALTH_COLORS[cat.health]
          return (
            <div key={i} className="p-3 rounded-lg border text-xs"
              style={{ background: `${hColor}08`, borderColor: `${hColor}20` }}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono text-white/70 truncate text-xs">{cat.category}</p>
                <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                  style={{ background: `${hColor}20`, color: hColor }}>
                  {cat.health}
                </span>
              </div>
              <div className="space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-white/40">Growth</span>
                  <span style={{ color: hColor }}>{cat.avg_growth_score}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Share</span>
                  <span className="text-white">{cat.avg_share_score}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">SKUs</span>
                  <span className="text-white">{cat.product_count}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
