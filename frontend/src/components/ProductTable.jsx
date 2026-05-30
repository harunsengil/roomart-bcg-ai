import { useState, useMemo } from 'react'
import { QUADRANT_META, ACTION_META, formatCurrency, formatScore } from '../utils/helpers'

// Skorlanmamış (DİĞER) ürünler için nötr rozet
const UNASSIGNED_META = { label: 'ATANMADI', emoji: '∅', color: '#6B7280' }

export default function ProductTable({ products }) {
  const [search, setSearch] = useState('')
  const [bcgFilter, setBcgFilter] = useState('ALL')
  const [sortField, setSortField] = useState('composite_score')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
    setPage(0)
  }

  const filtered = useMemo(() => {
    return products
      .filter(p => {
        const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase())
        const matchBcg =
          bcgFilter === 'ALL' ? true
          : bcgFilter === 'UNASSIGNED' ? p.is_unassigned
          : p.bcg_class === bcgFilter
        return matchSearch && matchBcg
      })
      .sort((a, b) => {
        const va = a[sortField] ?? 0
        const vb = b[sortField] ?? 0
        return sortDir === 'asc' ? va - vb : vb - va
      })
  }, [products, search, bcgFilter, sortField, sortDir])

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const SortHeader = ({ field, label }) => (
    <th className="px-4 py-3 text-left text-xs font-mono text-white/40 cursor-pointer hover:text-white/70 whitespace-nowrap"
      onClick={() => toggleSort(field)}>
      {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div className="card p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-white font-semibold">Product Intelligence</h2>
          <p className="text-xs text-white/40 font-mono mt-0.5">{filtered.length} products · {products.length} total</p>
        </div>
        <div className="flex gap-3 items-center">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search products..."
            className="px-3 py-1.5 text-xs font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-gold/40 w-48"
          />
          <div className="flex gap-1">
            {['ALL', 'STAR', 'CASH_COW', 'QUESTION_MARK', 'DOG', 'UNASSIGNED'].map(f => {
              const cfg = f === 'ALL' ? { color: '#888' }
                : f === 'UNASSIGNED' ? UNASSIGNED_META
                : QUADRANT_META[f]
              const label = f === 'ALL' ? 'ALL' : cfg.emoji
              return (
                <button key={f}
                  onClick={() => { setBcgFilter(f); setPage(0) }}
                  className="px-2 py-1 text-xs font-mono rounded border transition-all"
                  style={{
                    borderColor: bcgFilter === f ? cfg.color : 'rgba(255,255,255,0.1)',
                    color: bcgFilter === f ? cfg.color : 'rgba(255,255,255,0.4)',
                  }}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Product</th>
              <SortHeader field="share_score" label="Share" />
              <SortHeader field="growth_score" label="Growth" />
              <SortHeader field="composite_score" label="Score" />
              <SortHeader field="price" label="Price" />
              <th className="px-4 py-3 text-left text-xs font-mono text-white/40">BCG</th>
              <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((p, i) => {
              const cfg = QUADRANT_META[p.bcg_class] || UNASSIGNED_META
              const aColor = ACTION_META[p.recommendation?.action]?.color || '#888'
              return (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white text-sm truncate max-w-48">{p.name}</div>
                    <div className="text-xs text-white/40 font-mono">{p.category}</div>
                  </td>
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
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                      style={{ background: `${cfg.color}15`, color: cfg.color }}>
                      {cfg.emoji} {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.recommendation?.action ? (
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full"
                        style={{ background: `${aColor}15`, color: aColor }}>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-mono text-white/40">
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-2 py-1 rounded border border-white/10 disabled:opacity-30 hover:border-gold/40 hover:text-gold transition-all">
              ←
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(0, Math.min(page - 2 + i, totalPages - 1))
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className="px-2 py-1 rounded border transition-all"
                  style={{
                    borderColor: page === pg ? '#d4a017' : 'rgba(255,255,255,0.1)',
                    color: page === pg ? '#d4a017' : 'rgba(255,255,255,0.4)',
                  }}>
                  {pg + 1}
                </button>
              )
            })}
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
              className="px-2 py-1 rounded border border-white/10 disabled:opacity-30 hover:border-gold/40 hover:text-gold transition-all">
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
