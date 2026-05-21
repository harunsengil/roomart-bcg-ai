import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

const COLORS = ['#d4a017', '#00d4ff', '#00ff88', '#ff8800', '#aa88ff', '#ff6666', '#4488ff', '#ff4488', '#88ff44', '#ff88aa']

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card p-3 text-xs space-y-1">
      <p className="text-white/50 font-mono">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }}></div>
          <span className="text-white/70">{entry.name}:</span>
          <span className="text-white font-mono">{entry.value?.toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

export default function TrendChart({ trendsData }) {
  const [selected, setSelected] = useState(null)

  const keywords = Object.values(trendsData?.keywords || {})
  if (!keywords.length) return null

  // Build chart data - use last 12 weeks
  const selectedKw = selected ? keywords.find(k => k.keyword === selected) : keywords[0]
  const chartData = selectedKw?.weekly_data?.slice(-12).map(w => ({
    date: w.date.slice(5),
    value: w.value,
  })) || []

  // Summary cards
  const rising = keywords.filter(k => k.trend_direction === 'rising')
  const falling = keywords.filter(k => k.trend_direction === 'falling')

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-white font-semibold">Google Trends Analysis</h2>
          <p className="text-xs text-white/40 font-mono mt-0.5">{keywords.length} keywords tracked · 12-week view</p>
        </div>
        <div className="flex gap-3 text-xs font-mono">
          <span className="text-green-400">↑ {rising.length} rising</span>
          <span className="text-red-400">↓ {falling.length} falling</span>
        </div>
      </div>

      {/* Keyword selector */}
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw, i) => (
          <button key={kw.keyword}
            onClick={() => setSelected(kw.keyword)}
            className="px-3 py-1 text-xs font-mono rounded-full border transition-all"
            style={{
              borderColor: (!selected && i === 0) || selected === kw.keyword ? COLORS[i % COLORS.length] : 'rgba(255,255,255,0.1)',
              color: (!selected && i === 0) || selected === kw.keyword ? COLORS[i % COLORS.length] : 'rgba(255,255,255,0.4)',
              background: (!selected && i === 0) || selected === kw.keyword ? `${COLORS[i % COLORS.length]}15` : 'transparent',
            }}>
            {kw.trend_direction === 'rising' ? '↑' : kw.trend_direction === 'falling' ? '↓' : '→'} {kw.name}
          </button>
        ))}
      </div>

      {/* Main trend chart */}
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#d4a017" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#d4a017" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" stroke="#d4a017" strokeWidth={2} fill="url(#trendGrad)" dot={false} name={selectedKw?.name} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats row */}
      {selectedKw && (
        <div className="grid grid-cols-3 gap-3">
          <div className="px-3 py-2 rounded-lg bg-white/5 text-center">
            <p className="text-xs text-white/40 font-mono">Current Interest</p>
            <p className="text-lg font-display text-gold mt-1">{selectedKw.current_interest?.toFixed(1)}</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/5 text-center">
            <p className="text-xs text-white/40 font-mono">12-Week Growth</p>
            <p className={`text-lg font-display mt-1 ${selectedKw.growth_rate_12w > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {selectedKw.growth_rate_12w > 0 ? '+' : ''}{(selectedKw.growth_rate_12w * 100).toFixed(1)}%
            </p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/5 text-center">
            <p className="text-xs text-white/40 font-mono">Trend Signal</p>
            <p className={`text-lg font-display mt-1 ${
              selectedKw.trend_direction === 'rising' ? 'text-green-400' : 
              selectedKw.trend_direction === 'falling' ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {selectedKw.trend_direction?.toUpperCase()}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
