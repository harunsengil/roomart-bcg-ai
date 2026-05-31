import { motion } from 'framer-motion'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid,
  PolarAngleAxis, Radar, Legend,
} from 'recharts'
import { QUADRANT_META } from '../utils/helpers'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-navy-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono backdrop-blur-sm">
      <p className="text-white/40 mb-1">Week {label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/70">{p.name}: </span>
          <span className="font-bold" style={{ color: p.color }}>{p.value?.toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

function MiniSparkline({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function TrendCard({ trend, index }) {
  const isPositive = trend.growth_rate >= 0
  const color = isPositive ? '#10B981' : '#EF4444'
  const recent = trend.data_points?.slice(-12) || []

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white/4 rounded-xl border border-white/5 p-3 hover:border-white/10 transition-all"
    >
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-[10px] font-mono text-white/30 tracking-wider">{trend.slug}</p>
          <p className="text-sm font-body font-medium text-white">{trend.category}</p>
        </div>
        <div className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${isPositive ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
          {isPositive ? '+' : ''}{trend.growth_rate?.toFixed(1)}%
        </div>
      </div>

      <div className="my-2">
        <MiniSparkline data={recent} color={color} />
      </div>

      <div className="flex justify-between text-[9px] font-mono text-white/30">
        <span>Score: <b className="text-white/60">{trend.trend_score?.toFixed(0)}</b></span>
        <span>Peak: <b className="text-white/60">{trend.peak_interest?.toFixed(0)}</b></span>
        {trend.synthetic && <span className="text-yellow-400/50">~synthetic</span>}
      </div>
    </motion.div>
  )
}

export function TrendGrid({ trends }) {
  if (!trends?.length) return null

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-base tracking-[0.15em] text-white">TREND MOMENTUM</h2>
          <p className="text-[10px] font-mono text-white/30">Google Trends · 12-week window</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {trends.map((trend, i) => (
          <TrendCard key={trend.slug} trend={trend} index={i} />
        ))}
      </div>
    </div>
  )
}

export function TrendAreaChart({ trends }) {
  if (!trends?.length) return null

  // Build multi-series data (last 20 weeks)
  const maxWeeks = 20
  const seriesData = Array.from({ length: maxWeeks }, (_, i) => {
    const point = { week: i }
    trends.forEach(t => {
      const dp = t.data_points?.slice(-maxWeeks)[i]
      if (dp) point[t.category] = dp.value
    })
    return point
  })

  const COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899']

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-base tracking-[0.15em] text-white">CATEGORY TREND COMPARISON</h2>
          <p className="text-[10px] font-mono text-white/30">20-week trend index — Google Trends normalized 0-100</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={seriesData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'JetBrains Mono' }} tickFormatter={w => `W${w}`} />
          <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'JetBrains Mono' }} domain={[0, 100]} />
          <Tooltip content={<CustomTooltip />} />
          {trends.slice(0, 6).map((t, i) => (
            <Line
              key={t.slug}
              type="monotone"
              dataKey={t.category}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ScoreRadarChart({ categories }) {
  if (!categories?.length) return null

  const data = categories.map(cat => ({
    category: cat.category.split(' ').slice(0, 1).join(''),
    share: cat.share_score,
    growth: cat.growth_score,
    trend: cat.trend_score || 50,
  }))

  return (
    <div className="glass-card p-5">
      <div className="mb-4">
        <h2 className="font-display text-base tracking-[0.15em] text-white">PERFORMANCE RADAR</h2>
        <p className="text-[10px] font-mono text-white/30">Multi-dimension category comparison</p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <RadarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis dataKey="category" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'JetBrains Mono' }} />
          <Radar name="Market Share" dataKey="share" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.15} strokeWidth={1.5} />
          <Radar name="Growth Score" dataKey="growth" stroke="#10B981" fill="#10B981" fillOpacity={0.1} strokeWidth={1.5} />
          <Radar name="Trend Score" dataKey="trend" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.08} strokeWidth={1} />
          <Legend wrapperStyle={{ fontSize: '9px', fontFamily: 'JetBrains Mono', color: 'rgba(255,255,255,0.4)' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
