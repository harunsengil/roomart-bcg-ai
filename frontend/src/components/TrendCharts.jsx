import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid,
  PolarAngleAxis, Radar, Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { QUADRANT_META } from '../utils/helpers'

const COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899']

// Son N haftanın gerçek tarih etiketleri (12 hafta → son 12 Pazartesi)
function weekLabels(count) {
  const labels = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    labels.push(d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }))
  }
  return labels
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-navy-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono backdrop-blur-sm shadow-xl">
      <p className="text-white/40 mb-1.5 text-[10px]">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-white/60 text-[10px]">{p.name}:</span>
          <span className="font-bold text-[10px]" style={{ color: p.color }}>{p.value?.toFixed(0)}</span>
        </div>
      ))}
    </div>
  )
}

function TrendIcon({ growth }) {
  if (growth > 3)  return <TrendingUp size={13} className="text-emerald-400" />
  if (growth < -3) return <TrendingDown size={13} className="text-rose-400" />
  return <Minus size={13} className="text-white/30" />
}

function TrendCard({ trend, index, color, weekDates }) {
  const isPositive = trend.growth_rate >= 0
  const accentColor = Math.abs(trend.growth_rate) > 3
    ? (isPositive ? '#10B981' : '#EF4444')
    : '#6B7280'

  const chartData = (trend.data_points || []).map((dp, i) => ({
    date: weekDates[i] || `H${i + 1}`,
    value: dp.value,
  }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="bg-white/[0.03] rounded-xl border border-white/5 p-3 hover:border-white/10 transition-all"
    >
      {/* Başlık */}
      <div className="flex items-start justify-between mb-2 gap-1">
        <div className="min-w-0">
          <p className="text-[10px] font-mono text-white/30 truncate">{trend.slug}</p>
          <p className="text-sm font-body font-medium text-white leading-snug">{trend.category}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <TrendIcon growth={trend.growth_rate} />
          <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
            isPositive ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'
          }`}>
            {isPositive ? '+' : ''}{trend.growth_rate?.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Sparkline */}
      {chartData.length > 0 && (
        <div className="my-1.5">
          <ResponsiveContainer width="100%" height={44}>
            <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <defs>
                <linearGradient id={`sg-${trend.slug}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={accentColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value"
                stroke={accentColor} strokeWidth={1.5}
                fill={`url(#sg-${trend.slug})`} dot={false} />
              <Tooltip content={<CustomTooltip />} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Alt metrikler */}
      <div className="flex items-center justify-between text-[9px] font-mono text-white/30 mt-1">
        <span>Ort: <b className="text-white/55">{trend.trend_score?.toFixed(0)}</b></span>
        <span>Zirve: <b className="text-white/55">{trend.peak_interest?.toFixed(0)}</b></span>
        {trend.trend_label && (
          <span className={trend.trend_label.includes('Yükseliyor') ? 'text-emerald-400/70' : trend.trend_label.includes('Düşüyor') ? 'text-rose-400/70' : 'text-white/30'}>
            {trend.trend_label}
          </span>
        )}
      </div>
    </motion.div>
  )
}

export function TrendGrid({ trends }) {
  const weekDates = useMemo(() => weekLabels(12), [])

  if (!trends?.length) return (
    <div className="glass-card p-8 text-center">
      <TrendingUp size={24} className="mx-auto text-white/15 mb-3" />
      <p className="text-white/30 text-xs font-mono">Google Trends verisi henüz yükleniyor.</p>
      <p className="text-white/20 text-[10px] font-mono mt-1">Analiz workflow'u çalıştıktan sonra görünür.</p>
    </div>
  )

  const rising  = trends.filter(t => t.growth_rate >  3).length
  const falling = trends.filter(t => t.growth_rate < -3).length
  const stable  = trends.length - rising - falling

  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="font-display text-sm tracking-[0.15em] text-white">TREND MOMENTUM</h2>
          <p className="text-[10px] font-mono text-white/30 mt-0.5">Google Trends · Son 12 hafta · {trends.length} kategori</p>
        </div>
        {/* Özet */}
        <div className="flex items-center gap-3 flex-shrink-0 text-[10px] font-mono">
          {rising  > 0 && <span className="text-emerald-400">{rising}↑ yükselen</span>}
          {falling > 0 && <span className="text-rose-400">{falling}↓ düşen</span>}
          {stable  > 0 && <span className="text-white/30">{stable}→ sabit</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {trends.map((trend, i) => (
          <TrendCard key={trend.slug} trend={trend} index={i} color={COLORS[i % COLORS.length]} weekDates={weekDates} />
        ))}
      </div>
    </div>
  )
}

export function TrendAreaChart({ trends }) {
  const weekDates = useMemo(() => weekLabels(12), [])

  if (!trends?.length) return null

  // Multi-series: max 12 data points per category
  const seriesData = weekDates.map((date, i) => {
    const point = { date }
    trends.forEach(t => {
      const dp = t.data_points?.[i]
      if (dp != null) point[t.category] = dp.value ?? null
    })
    return point
  })

  return (
    <div className="glass-card p-5 overflow-hidden">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="font-display text-sm tracking-[0.15em] text-white">KATEGORI TREND KARŞILAŞTIRMA</h2>
          <p className="text-[10px] font-mono text-white/30 mt-0.5">
            Son 12 hafta · Google Trends normalize (0–100) · <span className="text-amber-300/60">Türkiye</span>
          </p>
        </div>
        {/* Renkli legend özeti */}
        <div className="hidden sm:flex items-center gap-3 flex-wrap flex-shrink-0">
          {trends.slice(0, 6).map((t, i) => (
            <div key={t.slug} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="text-[9px] font-mono text-white/50">{t.category}</span>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={seriesData} margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="date"
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            interval={1} />
          <YAxis domain={[0, 100]}
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            tickFormatter={v => v} />
          <Tooltip content={<CustomTooltip />} />
          {trends.slice(0, 6).map((t, i) => (
            <Line key={t.slug} type="monotone" dataKey={t.category}
              stroke={COLORS[i % COLORS.length]} strokeWidth={1.8}
              dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ScoreRadarChart({ categories, theme }) {
  if (!categories?.length) return null

  const light = theme === 'light'
  const gridStroke  = light ? 'rgba(15,23,42,0.14)' : 'rgba(255,255,255,0.06)'
  const tickFill    = light ? 'rgba(15,23,42,0.65)'  : 'rgba(255,255,255,0.4)'
  const legendColor = light ? 'rgba(15,23,42,0.65)'  : 'rgba(255,255,255,0.4)'

  const data = categories.map(cat => ({
    category: cat.category.split(' ')[0],  // ilk kelime kısaltması
    share: cat.share_score,
    growth: cat.growth_score,
    trend: cat.trend_score || 50,
  }))

  return (
    <div className="glass-card p-5 overflow-hidden h-full flex flex-col" style={{ minHeight: 600 }}>
      <div className="mb-4 flex-shrink-0">
        <h2 className="font-display text-sm tracking-[0.15em] text-white">PERFORMANCE RADAR</h2>
        <p className="text-[10px] font-mono text-white/30">Multi-dimension category comparison</p>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 20, right: 40, bottom: 20, left: 40 }} outerRadius="72%">
            <PolarGrid stroke={gridStroke} />
            <PolarAngleAxis dataKey="category"
              tick={{ fill: tickFill, fontSize: 11, fontFamily: 'JetBrains Mono' }} />
            <Radar name="Pazar Payı"    dataKey="share"  stroke="#F59E0B" fill="#F59E0B" fillOpacity={light ? 0.22 : 0.15} strokeWidth={1.5} />
            <Radar name="Büyüme Skoru" dataKey="growth" stroke="#10B981" fill="#10B981" fillOpacity={light ? 0.16 : 0.10} strokeWidth={1.5} />
            <Radar name="Trend Skoru"  dataKey="trend"  stroke="#3B82F6" fill="#3B82F6" fillOpacity={light ? 0.14 : 0.08} strokeWidth={1} />
            <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'JetBrains Mono', color: legendColor }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
