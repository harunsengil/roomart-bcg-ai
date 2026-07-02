import { useState, useMemo } from 'react'
import { Target, Search, ExternalLink, AlertTriangle, Info, ChevronRight, X } from 'lucide-react'
import {
  formatCurrency, CLEAR_ACTION_META, CLEAR_DIMENSIONS, scoreColor,
} from '../utils/helpers'

// Aksiyon kuyruğu öncelik sırası backend ile aynı (1 = en acil).
const ACTION_ORDER = ['fix_margin', 'fix_operation', 'scale', 'reduce_stock',
  'prepare_exit', 'test', 'protect', 'complete_data', 'monitor']

const RISK_TR = { high: 'Yüksek', medium: 'Orta', low: 'Düşük', unknown: '—' }
const RISK_COLOR = { high: '#EF4444', medium: '#F59E0B', low: '#10B981', unknown: '#6B7280' }

// ── Boş durum ─────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <Target size={40} className="text-gold-400/40" />
      <div>
        <h3 className="font-display text-xl tracking-wide text-white mb-2">CLEAR KARAR KATMANI</h3>
        <p className="text-sm text-white/40 font-mono max-w-md leading-relaxed">
          Henüz karar verisi yok. CLEAR skorları hassas marj verisi içerdiği için yalnız
          Firestore'dan (private) yüklenir. <br />
          Motoru çalıştır: <span className="text-gold-400">python3 backend/clear_engine.py</span>
        </p>
      </div>
    </div>
  )
}

// ── Skor rozeti (0-100 veya null) ─────────────────────────────────────────────
function ScoreDot({ score }) {
  const isNull = score === null || score === undefined
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: scoreColor(score) }} />
      <span className="font-mono text-sm" style={{ color: isNull ? '#6B7280' : 'var(--text-primary)' }}>
        {isNull ? '—' : Math.round(score)}
      </span>
    </span>
  )
}

// ── 5 boyutlu skor kartı ──────────────────────────────────────────────────────
function FiveDimensionScorecard({ product }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
      {CLEAR_DIMENSIONS.map(dim => {
        const s = product[dim.key]
        const isNull = s === null || s === undefined
        return (
          <div key={dim.key} title={dim.desc}
            className="rounded-lg border p-3 flex flex-col gap-2"
            style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wide text-white/40 leading-tight">
              {dim.label}
            </div>
            <div className="font-display text-2xl" style={{ color: scoreColor(s) }}>
              {isNull ? '—' : Math.round(s)}
            </div>
            {/* İlerleme çubuğu */}
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              {!isNull && (
                <div className="h-full rounded-full" style={{ width: `${s}%`, background: scoreColor(s) }} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Ürün detay modalı ─────────────────────────────────────────────────────────
function ProductDetail({ product, onClose }) {
  const meta = CLEAR_ACTION_META[product.recommended_action] || {}
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl border max-h-[90vh] overflow-y-auto"
        style={{ borderColor: 'var(--border)', background: 'var(--panel-bg, #0d1117)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2 py-0.5 rounded-full font-mono font-semibold"
                style={{ color: meta.color, background: meta.bg }}>
                {meta.icon} {meta.label}
              </span>
              <span className="text-[10px] font-mono text-white/30">öncelik {product.action_priority}</span>
            </div>
            <h3 className="text-sm font-medium text-white leading-snug">{product.product_name}</h3>
            <div className="text-[11px] font-mono text-white/30 mt-1">
              {product.category} · SKU {product.sku}
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <FiveDimensionScorecard product={product} />

          {/* Karar gerekçesi */}
          <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
            <div className="text-[10px] font-mono uppercase tracking-wide text-white/40 mb-2">Karar Gerekçesi</div>
            <p className="text-sm text-white/80 leading-relaxed">{product.decision_reason}</p>
            {product.first_step && (
              <div className="mt-3 flex items-start gap-2 text-[13px]">
                <ChevronRight size={16} className="text-gold-400 flex-shrink-0 mt-0.5" />
                <span className="text-white/70"><b className="text-gold-400">İlk adım:</b> {product.first_step}</span>
              </div>
            )}
          </div>

          {/* Marj + operasyon + risk detayları */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <DetailCell label="Katkı Marjı" value={product.contribution_margin_tl != null
              ? formatCurrency(product.contribution_margin_tl) : '—'} />
            <DetailCell label="Marj %" value={product.contribution_margin_pct != null
              ? `%${product.contribution_margin_pct}` : '—'} />
            <DetailCell label="Stok Riski" value={RISK_TR[product.stock_risk] || '—'}
              color={RISK_COLOR[product.stock_risk]} />
            <DetailCell label="Operasyon Riski" value={RISK_TR[product.operation_risk] || '—'}
              color={RISK_COLOR[product.operation_risk]} />
          </div>

          {/* Eksik veri uyarısı */}
          {product.missing_data?.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3">
              <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-[12px] text-amber-200/80 font-mono">
                Eksik veri: {product.missing_data.join(', ')} — bu boyutlar güveni düşürüyor.
              </div>
            </div>
          )}

          {/* BCG bağlantısı + link */}
          <div className="flex items-center justify-between text-[11px] font-mono text-white/40 pt-1">
            <span>BCG: {product.bcg_quadrant || '—'} → {product.current_bcg_action || '—'}</span>
            {product.url && (
              <a href={product.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-gold-400 hover:text-gold-300">
                Trendyol'da gör <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailCell({ label, value, color }) {
  return (
    <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
      <div className="text-[9px] font-mono uppercase tracking-wide text-white/35 mb-1">{label}</div>
      <div className="font-mono text-sm font-medium" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

// ── Özet kartları ─────────────────────────────────────────────────────────────
function SummaryCards({ summary, total, avgConf }) {
  const cards = [
    { key: 'total', label: 'Analiz Edilen', value: total, color: '#94A3B8' },
    { key: 'scale', label: 'Ölçekle', value: summary.scale || 0, color: CLEAR_ACTION_META.scale.color },
    { key: 'fix_margin', label: 'Marjı Onar', value: summary.fix_margin || 0, color: CLEAR_ACTION_META.fix_margin.color },
    { key: 'fix_operation', label: 'Operasyonu Onar', value: summary.fix_operation || 0, color: CLEAR_ACTION_META.fix_operation.color },
    { key: 'complete_data', label: 'Veriyi Tamamla', value: summary.complete_data || 0, color: CLEAR_ACTION_META.complete_data.color },
    { key: 'conf', label: 'Ort. Veri Güveni', value: avgConf, color: scoreColor(avgConf), suffix: '' },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {cards.map(c => (
        <div key={c.key} className="rounded-xl border p-3 sm:p-4"
          style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
          <div className="text-[10px] font-mono uppercase tracking-wide text-white/40 mb-1.5 leading-tight">{c.label}</div>
          <div className="font-display text-2xl sm:text-3xl" style={{ color: c.color }}>{c.value}</div>
        </div>
      ))}
    </div>
  )
}

// ── Ana sekme ─────────────────────────────────────────────────────────────────
export default function DecisionTab({ data }) {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  const products = data?.products || []
  const meta = data?.metadata || {}

  const filtered = useMemo(() => {
    let rows = [...products]
    if (actionFilter !== 'all') rows = rows.filter(p => p.recommended_action === actionFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(p =>
        (p.product_name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q))
    }
    // Öncelik sırası → sonra güven (yüksek üstte)
    return rows.sort((a, b) =>
      (a.action_priority - b.action_priority) ||
      ((b.confidence_score || 0) - (a.confidence_score || 0)))
  }, [products, actionFilter, search])

  if (!data || products.length === 0) return <EmptyState />

  // Filtre çipleri (yalnız mevcut aksiyonlar)
  const availableActions = ACTION_ORDER.filter(a => (meta.action_summary?.[a] || 0) > 0)

  return (
    <div className="space-y-4">
      {/* Marj verisi yoksa dürüst uyarı */}
      {!meta.has_margin_data && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/25 bg-blue-500/5 px-4 py-2.5">
          <Info size={15} className="text-blue-400 flex-shrink-0" />
          <p className="text-[11px] font-mono text-blue-200/70 leading-snug">
            Maliyet verisi girilmemiş — <b className="text-blue-300">Kâr Kalitesi</b> boş, kararlar
            "Veriyi Tamamla" ağırlıklı. <span className="text-blue-300">data/manual_margin_inputs.csv</span> doldurulunca
            marj bazlı kararlar (Ölçekle / Marjı Onar) devreye girer.
          </p>
        </div>
      )}

      <SummaryCards summary={meta.action_summary || {}} total={meta.total_products || products.length}
        avgConf={meta.avg_confidence ?? 0} />

      {/* Arama + filtre */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Ürün, kategori veya SKU ara..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-gold-500/40"
            style={{ borderColor: 'var(--border)' }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={actionFilter === 'all'} onClick={() => setActionFilter('all')} label="Tümü" />
          {availableActions.map(a => (
            <FilterChip key={a} active={actionFilter === a} onClick={() => setActionFilter(a)}
              label={CLEAR_ACTION_META[a].label} color={CLEAR_ACTION_META[a].color}
              count={meta.action_summary?.[a]} />
          ))}
        </div>
      </div>

      {/* Aksiyon kuyruğu tablosu */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wide text-white/40"
                style={{ background: 'var(--card-bg)' }}>
                <th className="text-left px-3 py-2.5 font-medium">#</th>
                <th className="text-left px-3 py-2.5 font-medium">Ürün</th>
                <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Kategori</th>
                <th className="text-left px-3 py-2.5 font-medium">Önerilen Aksiyon</th>
                <th className="text-center px-2 py-2.5 font-medium" title="Talep">Tlp</th>
                <th className="text-center px-2 py-2.5 font-medium" title="Rekabet">Rkb</th>
                <th className="text-center px-2 py-2.5 font-medium" title="Kâr">Kâr</th>
                <th className="text-center px-2 py-2.5 font-medium" title="Operasyon">Ops</th>
                <th className="text-center px-2 py-2.5 font-medium" title="Güven">Gvn</th>
                <th className="px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const am = CLEAR_ACTION_META[p.recommended_action] || {}
                return (
                  <tr key={p.sku || i}
                    className="border-t cursor-pointer hover:bg-white/[0.03] transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => setSelected(p)}>
                    <td className="px-3 py-2.5 font-mono text-xs text-white/30">{i + 1}</td>
                    <td className="px-3 py-2.5 max-w-[280px]">
                      <div className="truncate text-white/85" title={p.product_name}>{p.product_name}</div>
                      {p.blocking_issue && (
                        <div className="text-[10px] font-mono text-red-400/70 mt-0.5">⚠ {p.blocking_issue}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-white/50 text-xs hidden md:table-cell">{p.category}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-2 py-1 rounded-full font-mono font-semibold whitespace-nowrap"
                        style={{ color: am.color, background: am.bg }}>
                        {am.icon} {am.label}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center"><ScoreDot score={p.demand_score} /></td>
                    <td className="px-2 py-2.5 text-center"><ScoreDot score={p.competition_score} /></td>
                    <td className="px-2 py-2.5 text-center"><ScoreDot score={p.profit_score} /></td>
                    <td className="px-2 py-2.5 text-center"><ScoreDot score={p.operation_score} /></td>
                    <td className="px-2 py-2.5 text-center"><ScoreDot score={p.confidence_score} /></td>
                    <td className="px-2 py-2.5 text-right"><ChevronRight size={15} className="text-white/25 inline" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-white/30 font-mono">Eşleşen ürün yok</div>
        )}
      </div>

      {selected && <ProductDetail product={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function FilterChip({ active, onClick, label, color, count }) {
  return (
    <button onClick={onClick}
      className="text-[11px] font-mono px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap"
      style={{
        borderColor: active ? (color || 'var(--gold)') : 'var(--border)',
        background: active ? (color ? `${color}22` : 'rgba(245,158,11,0.12)') : 'transparent',
        color: active ? (color || 'var(--gold)') : 'var(--text-secondary, rgba(255,255,255,0.5))',
      }}>
      {label}{count != null ? ` ${count}` : ''}
    </button>
  )
}
