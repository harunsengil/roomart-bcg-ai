import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Zap, Info, TrendingUp, Clock, ChevronRight, ChevronUp, ChevronDown, Swords } from 'lucide-react'
import { ACTION_META, QUADRANT_META, tone } from '../utils/helpers'
import { useIsLight } from '../hooks/useTheme'

const ALERT_ICONS = { RISK: AlertTriangle, OPPORTUNITY: TrendingUp, QUADRANT_CHANGE: Zap, INFO: Info, SUCCESS: Info }
const SEVERITY_STYLES = {
  HIGH:   { border: '#EF4444', bg: 'rgba(239,68,68,0.05)',  badge: 'bg-red-500/20 text-red-400' },
  MEDIUM: { border: '#F59E0B', bg: 'rgba(245,158,11,0.05)', badge: 'bg-amber-500/20 text-amber-400' },
  LOW:    { border: '#3B82F6', bg: 'rgba(59,130,246,0.05)', badge: 'bg-blue-500/20 text-blue-400' },
  INFO:   { border: '#6B7280', bg: 'rgba(107,114,128,0.04)', badge: 'bg-white/10 text-white/40' },
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

// ── Tekil uyarı kartı ──────────────────────────────────────────────────────────
function AlertCard({ alert, index, onGoToProduct }) {
  const Icon = ALERT_ICONS[alert.type] || Info
  const sty = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.INFO
  const hasProduct = !!alert.product_id && !!onGoToProduct
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}
      className="p-3 rounded-xl border-l-2 mb-2" style={{ borderLeftColor: sty.border, background: sty.bg }}>
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: sty.border + '15' }}>
          <Icon size={13} style={{ color: sty.border }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${sty.badge}`}>{alert.severity}</span>
            <span className="text-[9px] font-mono text-white/25">{alert.type}</span>
            {hasProduct && (
              <button onClick={() => onGoToProduct(alert.product_id)}
                className="ml-auto flex items-center gap-0.5 text-[9px] font-mono text-white/30 hover:text-gold-400 transition-colors">
                Ürüne git <ChevronRight size={8} />
              </button>
            )}
          </div>
          <p className="text-[12px] text-white/80 font-body leading-snug">{alert.message}</p>
          {alert.detail && <p className="text-[10px] text-white/35 font-mono mt-1">{alert.detail}</p>}
          <div className="flex items-center gap-1 mt-1.5 text-[9px] text-white/25 font-mono">
            <Clock size={8} />{timeAgo(alert.timestamp)}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Rakip uyarı kartı (aynı görsel dil) ───────────────────────────────────────
function CompAlertCard({ alert, index }) {
  const sty = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.INFO
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.04 }}
      className="p-3 rounded-xl border-l-2 mb-2" style={{ borderLeftColor: sty.border, background: sty.bg }}>
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: sty.border + '15' }}>
          <Swords size={11} style={{ color: sty.border }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${sty.badge}`}>{alert.severity}</span>
            <span className="text-[9px] font-mono text-white/25">COMPETITOR</span>
          </div>
          <p className="text-[11px] font-mono font-medium text-white/80 leading-snug">{alert.title}</p>
          <p className="text-[10px] text-white/45 leading-snug mt-0.5">{alert.message}</p>
          <div className="flex items-center gap-1 mt-1.5 text-[9px] text-white/25 font-mono">
            <Clock size={8} />{timeAgo(alert.timestamp)}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Açılır kapanır bölüm başlığı ──────────────────────────────────────────────
function SectionHeader({ title, count, highCount, open, onToggle, icon: Icon, rightAction }) {
  return (
    <div className="flex items-center gap-2 mb-2 flex-shrink-0">
      <button type="button" onClick={onToggle}
        className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity">
        {Icon && <Icon size={13} className="text-white/50 flex-shrink-0" />}
        <span className="font-display text-sm tracking-[0.15em] text-white">{title}</span>
        <span className="text-[10px] font-mono text-white/30">
          {count} signal{count !== 1 ? 's' : ''}{highCount ? ` · ${highCount} high` : ''}
        </span>
        {highCount > 0 && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
            <div className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[9px] font-mono text-red-400">{highCount}</span>
          </div>
        )}
        {open ? <ChevronUp size={12} className="text-white/35 ml-auto" /> : <ChevronDown size={12} className="text-white/35 ml-auto" />}
      </button>
      {rightAction}
    </div>
  )
}

// ── Ana panel ─────────────────────────────────────────────────────────────────
export function AlertsPanel({ alerts, competitive, onNavigateToCompetition, onGoToProduct }) {
  const [bcgOpen, setBcgOpen]   = useState(true)
  const [compOpen, setCompOpen] = useState(true)

  const high   = alerts?.filter(a => a.severity === 'HIGH') || []
  const sorted = [...high, ...(alerts?.filter(a => a.severity !== 'HIGH') || [])]
  const compAlerts = competitive?.alerts || []
  const compHigh   = compAlerts.filter(a => a.severity === 'HIGH').length

  return (
    <div className="glass-card p-4 flex flex-col h-full min-h-0">
      <div className="overflow-y-auto flex-1 min-h-0 pr-0.5">

        {/* ── BCG / Stratejik uyarılar ── */}
        <SectionHeader
          title="STRATEGIC ALERTS"
          count={sorted.length}
          highCount={high.length}
          open={bcgOpen}
          onToggle={() => setBcgOpen(o => !o)}
        />
        <AnimatePresence initial={false}>
          {bcgOpen && (
            <motion.div key="bcg-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              {sorted.length === 0
                ? <div className="flex items-center justify-center h-16"><p className="text-white/20 text-xs font-mono">No active alerts</p></div>
                : <AnimatePresence>{sorted.map((a, i) => <AlertCard key={a.id} alert={a} index={i} onGoToProduct={onGoToProduct} />)}</AnimatePresence>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Rakip uyarıları ── */}
        {compAlerts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/8">
            <SectionHeader
              title="COMPETITOR ALERTS"
              count={compAlerts.length}
              highCount={compHigh}
              open={compOpen}
              onToggle={() => setCompOpen(o => !o)}
              icon={Swords}
              rightAction={
                onNavigateToCompetition && (
                  <button onClick={onNavigateToCompetition}
                    className="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono text-gold/60 hover:text-gold transition-colors ml-2">
                    Competition <ChevronRight size={10} />
                  </button>
                )
              }
            />
            <AnimatePresence initial={false}>
              {compOpen && (
                <motion.div key="comp-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <AnimatePresence>
                    {compAlerts.map((a, i) => <CompAlertCard key={a.id} alert={a} index={i} />)}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

// ── AI Önerileri ──────────────────────────────────────────────────────────────
export function RecommendationsPanel({ categories, onGoToCategory }) {
  const light = useIsLight()
  if (!categories) return null
  const sorted = [...categories].sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    return (order[a.recommendation?.priority] || 2) - (order[b.recommendation?.priority] || 2)
  })
  return (
    <div className="glass-card p-4 flex flex-col h-full">
      <div className="mb-3 flex-shrink-0">
        <h2 className="font-display text-sm tracking-[0.15em] text-white">AI RECOMMENDATIONS</h2>
        <p className="text-[10px] font-mono text-white/30">BCG-driven strategic playbook · Kategoriye tıkla → Overview'da incele</p>
      </div>
      <div className="overflow-y-auto flex-1 space-y-2">
        {sorted.map((cat, i) => {
          const am0 = ACTION_META[cat.recommendation?.action] || {}
          const am  = { ...am0, color: tone(am0.color, light) }
          const qm  = QUADRANT_META[cat.bcg?.quadrant] || {}
          const rec = cat.recommendation || {}
          const clickable = !!onGoToCategory
          return (
            <motion.div key={cat.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              onClick={() => onGoToCategory?.(cat)}
              className={`p-3 rounded-xl border border-white/5 bg-white/[0.02] transition-all ${clickable ? 'cursor-pointer hover:border-gold/25 hover:bg-white/[0.04]' : 'cursor-default'}`}>
              <div className="flex items-start gap-3">
                <div className="text-lg w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: qm.bg || am.bg }}>
                  {qm.emoji || '📊'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-body font-medium text-white">{cat.category}</span>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded tracking-wider" style={{ background: am.bg, color: am.color }}>
                      {rec.action}
                    </span>
                    {clickable && <ChevronRight size={11} className="ml-auto text-white/20" />}
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
