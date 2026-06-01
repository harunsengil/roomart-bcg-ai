import { useState, useMemo } from 'react'
import { QUADRANT_META, ACTION_META, formatCurrency, formatScore } from '../utils/helpers'

// Skorlanmamış (DİĞER) ürünler için nötr rozet
const UNASSIGNED_META = { label: 'ATANMADI', emoji: '∅', color: '#6B7280' }
const BCG_FILTERS = ['ALL', 'STAR', 'CASH_COW', 'QUESTION_MARK', 'DOG', 'UNASSIGNED']
const ACTION_FILTERS = ['ALL', 'INVEST', 'HARVEST', 'TEST', 'EXIT']
const STRING_SORT = new Set(['name', 'kod', 'bcg', 'action'])
const PAGE_SIZE = 10

// Sıralama değeri (string alanlar localeCompare, sayısal alanlar numeric)
function sortVal(p, field) {
  switch (field) {
    case 'name': return p.name || ''
    case 'kod': return p.kod || ''
    case 'bcg': return p.bcg_class || ''
    case 'action': return p.recommendation?.action || ''
    default: return p[field]
  }
}

export default function ProductTable({ products }) {
  const [search, setSearch] = useState('')
  const [bcgFilter, setBcgFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [sortField, setSortField] = useState('composite_score')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir(STRING_SORT.has(field) ? 'asc' : 'desc') }
    setPage(0)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products
      .filter(p => {
        // Tüm sütunlarda ara: ad, kategori, kod, fiyat, skorlar, BCG, action
        const hay = [
          p.name, p.category, p.kod, p.bcg_class, p.recommendation?.action,
          p.share_score, p.growth_score, p.composite_score, p.price,
        ].map(x => String(x ?? '')).join(' ').toLowerCase()
        const matchSearch = !q || hay.includes(q)
        const matchBcg =
          bcgFilter === 'ALL' ? true
          : bcgFilter === 'UNASSIGNED' ? p.is_unassigned
          : p.bcg_class === bcgFilter
        const matchAction = actionFilter === 'ALL' || p.recommendation?.action === actionFilter
        return matchSearch && matchBcg && matchAction
      })
      .sort((a, b) => {
        const va = sortVal(a, sortField)
        const vb = sortVal(b, sortField)
        if (STRING_SORT.has(sortField)) {
          const r = String(va).localeCompare(String(vb), 'tr')
          return sortDir === 'asc' ? r : -r
        }
        const na = va ?? -Infinity, nb = vb ?? -Infinity
        return sortDir === 'asc' ? na - nb : nb - na
      })
  }, [products, search, bcgFilter, actionFilter, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paginated = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // Distinct sayfa penceresi (önceki "1 1 1 2 3" tekrar hatası giderildi)
  const MAX_BTN = 5
  const winStart = Math.max(0, Math.min(safePage - 2, totalPages - MAX_BTN))
  const winEnd = Math.min(totalPages, winStart + MAX_BTN)
  const pageWindow = Array.from({ length: winEnd - winStart }, (_, i) => winStart + i)

  const SortHeader = ({ field, label }) => (
    <th className="px-4 py-3 text-left text-xs font-mono text-white/40 cursor-pointer hover:text-white/70 whitespace-nowrap select-none"
      onClick={() => toggleSort(field)}>
      {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  const PageBtn = ({ onClick, disabled, active, children }) => (
    <button onClick={onClick} disabled={disabled}
      className="px-2 py-1 rounded border transition-all disabled:opacity-30 hover:border-gold/40 hover:text-gold"
      style={{ borderColor: active ? '#d4a017' : 'rgba(255,255,255,0.1)', color: active ? '#d4a017' : 'rgba(255,255,255,0.5)' }}>
      {children}
    </button>
  )

  const Chip = ({ active, color, label, onClick }) => (
    <button onClick={onClick} className="px-2 py-1 text-xs font-mono rounded border transition-all"
      style={{ borderColor: active ? color : 'rgba(255,255,255,0.1)', color: active ? color : 'rgba(255,255,255,0.4)', background: active ? color + '15' : 'transparent' }}>
      {label}
    </button>
  )

  return (
    <div className="card p-6 space-y-4">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-white font-semibold">Product Intelligence</h2>
          <p className="text-xs text-white/40 font-mono mt-0.5">{filtered.length} products · {products.length} total</p>
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Ara: ad, kod, kategori, fiyat, BCG, action…"
            className="px-3 py-1.5 text-xs font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-gold/40 w-72"
          />
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[9px] font-mono text-white/25 mr-0.5">BCG</span>
            {BCG_FILTERS.map(f => {
              const cfg = f === 'ALL' ? { color: '#888' } : f === 'UNASSIGNED' ? UNASSIGNED_META : QUADRANT_META[f]
              return <Chip key={f} active={bcgFilter === f} color={cfg.color}
                label={f === 'ALL' ? 'ALL' : cfg.emoji} onClick={() => { setBcgFilter(f); setPage(0) }} />
            })}
          </div>
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[9px] font-mono text-white/25 mr-0.5">Action</span>
            {ACTION_FILTERS.map(a => {
              const color = a === 'ALL' ? '#888' : (ACTION_META[a]?.color || '#888')
              return <Chip key={a} active={actionFilter === a} color={color}
                label={a} onClick={() => { setActionFilter(a); setPage(0) }} />
            })}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-3 py-3 text-left text-xs font-mono text-white/40">No</th>
              <SortHeader field="name" label="Product" />
              <SortHeader field="kod" label="Kod" />
              <SortHeader field="share_score" label="Share" />
              <SortHeader field="growth_score" label="Growth" />
              <SortHeader field="composite_score" label="Score" />
              <SortHeader field="price" label="Price" />
              <SortHeader field="bcg" label="BCG" />
              <SortHeader field="action" label="Action" />
            </tr>
          </thead>
          <tbody>
            {paginated.map((p, i) => {
              const cfg = QUADRANT_META[p.bcg_class] || UNASSIGNED_META
              const aColor = ACTION_META[p.recommendation?.action]?.color || '#888'
              const rowNo = safePage * PAGE_SIZE + i + 1
              return (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-white/30">{rowNo}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white text-sm truncate max-w-48" title={p.name}>{p.name}</div>
                    <div className="text-xs text-white/40 font-mono">{p.category}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white/60">{p.kod || '—'}</td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{formatScore(p.share_score)}</td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{formatScore(p.growth_score)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 bg-white/10 rounded-full w-16">
                        <div className="h-full rounded-full" style={{ width: `${p.composite_score ?? 0}%`, background: cfg.color }}></div>
                      </div>
                      <span className="font-mono text-xs text-white">{formatScore(p.composite_score)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-white">{formatCurrency(p.price)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: `${cfg.color}15`, color: cfg.color }}>
                      {cfg.emoji} {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.recommendation?.action ? (
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: `${aColor}15`, color: aColor }}>
                        {p.recommendation.action}
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-white/30">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination — distinct sayfalar + ilk/son ok */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-mono text-white/40">
          <span>{safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}</span>
          <div className="flex gap-1">
            <PageBtn onClick={() => setPage(0)} disabled={safePage === 0} title="İlk sayfa">«</PageBtn>
            <PageBtn onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>‹</PageBtn>
            {pageWindow.map(pg => (
              <PageBtn key={pg} onClick={() => setPage(pg)} active={safePage === pg}>{pg + 1}</PageBtn>
            ))}
            <PageBtn onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1}>›</PageBtn>
            <PageBtn onClick={() => setPage(totalPages - 1)} disabled={safePage === totalPages - 1} title="Son sayfa">»</PageBtn>
          </div>
        </div>
      )}
    </div>
  )
}
