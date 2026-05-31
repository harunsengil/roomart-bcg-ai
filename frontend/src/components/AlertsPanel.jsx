import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Zap, Info, TrendingUp, Clock, ChevronRight } from 'lucide-react'
import { ACTION_META } from '../utils/helpers'

const ALERT_ICONS = { RISK: AlertTriangle, OPPORTUNITY: TrendingUp, QUADRANT_CHANGE: Zap, INFO: Info }
const SEVERITY_STYLES = {
  HIGH: { border: '#EF4444', bg: 'rgba(239,68,68,0.05)', badge: 'bg-red-500/20 text-red-400' },
  MEDIUM: { border: '#F59E0B', bg: 'rgba(245,158,11,0.05)', badge: 'bg-amber-500/20 text-amber-400' },
  LOW: { border: '#3B82F6', bg: 'rgba(59,130,246,0.05)', badge: 'bg-blue-500/20 text-blue-400' },
}
function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
function AlertCard({ alert, index }) {
  const Icon = ALERT_ICONS[alert.type] || Info
  const sty = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.LOW
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }}
      className="p-3 rounded-xl border-l-2 mb-2" style={{ borderLeftColor: sty.border, background: sty.bg }}>
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: sty.border + '15' }}>
          <Icon size={13} style={{ color: sty.border }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${sty.badge}`}>{alert.severity}</span>
            <span className="text-[9px] font-mono text-white/25">{alert.type}</span>
          </div>
          <p className="text-[12px] text-white/80 font-body leading-snug">{alert.message}</p>
          <p className="text-[10px] text-white/35 font-mono mt-1">{alert.detail}</p>
          <div className="flex items-center gap-1 mt-1.5 text-[9px] text-white/25 font-mono">
            <Clock size={8} />{timeAgo(alert.timestamp)}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
export function AlertsPanel({ alerts }) {
  const high = alerts?.filter(a => a.severity === 'HIGH') || []
  const sorted = [...high, ...(alerts?.filter(a => a.severity !== 'HIGH') || [])]
  return (
    <div className="glass-card p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <h2 className="font-display text-base tracking-[0.15em] text-white">STRATEGIC ALERTS</h2>
          <p className="text-[10px] font-mono text-white/30">{alerts?.length || 0} active signals</p>
        </div>
        {high.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[10px] font-mono text-red-400">{high.length} HIGH</span>
          </div>
        )}
      </div>
      <div className="overflow-y-auto flex-1">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <p className="text-white/20 text-xs font-mono">No active alerts</p>
          </div>
        ) : (
          <AnimatePresence>{sorted.map((alert, i) => <AlertCard key={alert.id} alert={alert} index={i} />)}</AnimatePresence>
        )}
      </div>
    </div>
  )
}
export function RecommendationsPanel({ categories }) {
  if (!categories) return null
  const sorted = [...categories].sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return (order[a.recommendation?.priority] || 2) - (order[b.recommendation?.priority] || 2)
  })
  return (
    <div className="glass-card p-4 flex flex-col h-full">
      <div className="mb-3 flex-shrink-0">
        <h2 className="font-display text-base tracking-[0.15em] text-white">AI RECOMMENDATIONS</h2>
        <p className="text-[10px] font-mono text-white/30">BCG-driven strategic playbook</p>
      </div>
      <div className="overflow-y-auto flex-1 space-y-2">
        {sorted.map((cat, i) => {
          const am = ACTION_META[cat.recommendation?.action] || {}
          const rec = cat.recommendation || {}
          return (
            <motion.div key={cat.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="p-3 rounded-xl border border-white/5 bg-white/3 hover:border-white/10 transition-all cursor-default">
              <div className="flex items-start gap-3">
                <div className="text-lg w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: am.bg }}>
                  {cat.bcg?.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-body font-medium text-white">{cat.category}</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded tracking-wider" style={{ background: am.bg, color: am.color }}>
                      {rec.action}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed mb-2">{rec.rationale}</p>
                  <div className="text-[9px] font-mono text-white/25">
                    Priority: <span className={rec.priority === 'HIGH' ? 'text-red-400' : rec.priority === 'MEDIUM' ? 'text-amber-400' : 'text-white/40'}>{rec.priority}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
