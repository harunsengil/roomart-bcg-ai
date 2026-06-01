import { useState, useMemo } from 'react'
import { Filter, X, Download, Search, ExternalLink } from 'lucide-react'
import { QUADRANT_META, ACTION_META, formatCurrency, formatScore } from '../utils/helpers'

const UNASSIGNED_META = { label: 'ATANMADI', emoji: '∅', color: '#6B7280' }
const BCG_FILTERS = ['ALL', 'STAR', 'CASH_COW', 'QUESTION_MARK', 'DOG', 'UNASSIGNED']
const ACTION_FILTERS = ['ALL', 'INVEST', 'HARVEST', 'TEST', 'EXIT']
const STRING_SORT = new Set(['name', 'category', 'kod', 'bcg', 'action'])
const SEARCH_FIELDS = ['name', 'category', 'kod', 'bcg', 'action', 'share_score', 'growth_score', 'composite_score', 'price']
const PAGE_SIZE = 10

function colText(p, field) {
  switch (field) {
    case 'name': return p.name || ''
    case 'category': return p.category || ''
    case 'kod': return p.kod || ''
    case 'share_score': return p.share_score ?? ''
    case 'growth_score': return p.growth_score ?? ''
    case 'composite_score': return p.composite_score ?? ''
    case 'price': return p.price ?? ''
    case 'bcg': return p.bcg_class || ''
    case 'action': return p.recommendation?.action || ''
    default: return ''
  }
}
function sortVal(p, field) { return STRING_SORT.has(field) ? String(colText(p, field)) : colText(p, field) }
// binlik-ayraç duyarsız ("₺11.650" = "11.650" = "11650")
const norm = (s) => String(s).toLowerCase().replace(/[.,\s₺]/g, '')
// ALAN-BAZLI eşleştirme (birleştirme yok → cross-field false match yok)
const cellMatch = (cell, q) => {
  const c = String(cell).toLowerCase()
  return c.includes(q.toLowerCase()) || norm(c).includes(norm(q))
}

export default function ProductTable({ products }) {
  const [search, setSearch] = useState('')
  const [bcgFilter, setBcgFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [colFilters, setColFilters] = useState({})   // { field: [seçili değerler] }
  const [colSearch, setColSearch] = useState({})      // popup içi arama { field: text }
  const [openCol, setOpenCol] = useState(null)
  const [sortField, setSortField] = useState('composite_score')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir(STRING_SORT.has(field) ? 'asc' : 'desc') }
    setPage(0)
  }
  const toggleVal = (field, v) => {
    setColFilters(f => {
      const cur = new Set(f[field] || [])
      cur.has(v) ? cur.delete(v) : cur.add(v)
      return { ...f, [field]: [...cur] }
    })
    setPage(0)
  }
  const clearCol = (field) => { setColFilters(f => { const n = { ...f }; delete n[field]; return n }); setPage(0) }

  const distinctValues = (field) => {
    const s = new Set()
    products.forEach(p => { const v = colText(p, field); if (v !== '' && v != null) s.add(String(v)) })
    const arr = [...s]
    arr.sort(STRING_SORT.has(field) ? (a, b) => a.localeCompare(b, 'tr') : (a, b) => Number(a) - Number(b))
    return arr
  }

  const filtered = useMemo(() => {
    const q = search.trim()
    return products
      .filter(p => {
        if (q && !(SEARCH_FIELDS.some(f => cellMatch(colText(p, f), q)) || cellMatch(formatCurrency(p.price), q))) return false
        for (const [field, vals] of Object.entries(colFilters)) {
          if (vals && vals.length && !vals.includes(String(colText(p, field)))) return false
        }
        const matchBcg = bcgFilter === 'ALL' ? true : bcgFilter === 'UNASSIGNED' ? p.is_unassigned : p.bcg_class === bcgFilter
        const matchAction = actionFilter === 'ALL' || p.recommendation?.action === actionFilter
        return matchBcg && matchAction
      })
      .sort((a, b) => {
        const va = sortVal(a, sortField), vb = sortVal(b, sortField)
        if (STRING_SORT.has(sortField)) {
          const r = String(va).localeCompare(String(vb), 'tr')
          return sortDir === 'asc' ? r : -r
        }
        const na = va ?? -Infinity, nb = vb ?? -Infinity
        return sortDir === 'asc' ? na - nb : nb - na
      })
  }, [products, search, bcgFilter, actionFilter, colFilters, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paginated = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const MAX_BTN = 5
  const winStart = Math.max(0, Math.min(safePage - 2, totalPages - MAX_BTN))
  const pageWindow = Array.from({ length: Math.min(totalPages, winStart + MAX_BTN) - winStart }, (_, i) => winStart + i)

  const exportCSV = () => {
    const header = ['No', 'Ürün', 'Kategori', 'Kod', 'Share', 'Growth', 'Score', 'Price', 'BCG', 'Action', 'URL']
    const rows = filtered.map((p, i) => [
      i + 1, p.name, p.category, p.kod || '', p.share_score ?? '', p.growth_score ?? '',
      p.composite_score ?? '', p.price ?? '', p.bcg_class || '', p.recommendation?.action || '', p.url || '',
    ])
    const esc = v => `"${String(v).replace(/"/g, '""')}"`
    const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'roomart-urunler.csv'
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  const Chip = ({ active, color, label, onClick }) => (
    <button onClick={onClick} className="px-2 py-1 text-xs font-mono rounded border transition-all"
      style={{ borderColor: active ? color : 'rgba(255,255,255,0.1)', color: active ? color : 'rgba(255,255,255,0.4)', background: active ? color + '15' : 'transparent' }}>
      {label}
    </button>
  )
  const PageBtn = ({ onClick, disabled, active, children, title }) => (
    <button onClick={onClick} disabled={disabled} title={title}
      className="px-2 py-1 rounded border transition-all disabled:opacity-30 hover:border-gold/40 hover:text-gold"
      style={{ borderColor: active ? '#d4a017' : 'rgba(255,255,255,0.1)', color: active ? '#d4a017' : 'rgba(255,255,255,0.5)' }}>{children}</button>
  )

  const HeadCell = ({ field, label }) => {
    const sel = colFilters[field] || []
    const cs = (colSearch[field] || '').toLowerCase()
    const values = openCol === field ? distinctValues(field).filter(v => !cs || v.toLowerCase().includes(cs) || norm(v).includes(norm(cs))) : []
    return (
      <th className="relative px-4 py-3 text-left text-xs font-mono text-white/40 whitespace-nowrap select-none">
        <div className="flex items-center gap-1">
          <span className="cursor-pointer hover:text-white/70" onClick={() => toggleSort(field)}>
            {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </span>
          <button onClick={() => setOpenCol(openCol === field ? null : field)} title="Sütun filtresi"
            style={{ color: sel.length ? '#d4a017' : undefined }} className={sel.length ? '' : 'text-white/20 hover:text-white/50'}>
            <Filter size={11} />
            {sel.length > 0 && <span className="ml-0.5 text-[8px]">{sel.length}</span>}
          </button>
        </div>
        {openCol === field && (
          <div className="absolute left-2 top-full z-50 mt-1 w-52 rounded-lg border border-white/10 bg-navy-900/98 p-2 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-1.5">
              <button onClick={() => clearCol(field)} className="text-[10px] font-mono text-gold-400 hover:text-gold-300">Tümü</button>
              {sel.length > 0 && <button onClick={() => clearCol(field)} className="text-white/40 hover:text-white" title="Seçimi temizle"><X size={12} /></button>}
            </div>
            <div className="relative mb-1.5">
              <input autoFocus value={colSearch[field] || ''} onChange={e => setColSearch(s => ({ ...s, [field]: e.target.value }))}
                placeholder="Ara…" className="w-full pr-6 px-2 py-1 text-xs font-mono bg-white/5 border border-white/10 rounded text-white placeholder-white/25 focus:outline-none focus:border-gold/40" />
              {colSearch[field] && <button onClick={() => setColSearch(s => ({ ...s, [field]: '' }))} className="absolute right-1 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><X size={11} /></button>}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {values.length === 0 && <div className="text-[10px] text-white/25 px-1 py-2">sonuç yok</div>}
              {values.map(v => {
                const checked = sel.includes(v)
                return (
                  <button key={v} onClick={() => toggleVal(field, v)}
                    className="flex items-center gap-2 w-full text-left px-1.5 py-1 rounded text-[11px] font-mono hover:bg-white/5">
                    <span className="flex-shrink-0 w-3 h-3 rounded border flex items-center justify-center"
                      style={{ borderColor: checked ? '#d4a017' : 'rgba(255,255,255,0.25)', background: checked ? '#d4a017' : 'transparent' }}>
                      {checked && <span className="text-[8px] text-black leading-none">✓</span>}
                    </span>
                    <span className="truncate text-white/70">{v}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </th>
    )
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-white font-semibold">Product Intelligence</h2>
          <p className="text-xs text-white/40 font-mono mt-0.5">{filtered.length} products · {products.length} total</p>
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
                placeholder="Ara: ad, kod, kategori, fiyat, BCG, action…"
                className="pl-7 pr-7 py-1.5 text-xs font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-gold/40 w-72" />
              {search && <button onClick={() => { setSearch(''); setPage(0) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><X size={13} /></button>}
            </div>
            <button onClick={exportCSV} title="Filtreli veriyi Excel/CSV indir"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-all">
              <Download size={13} /> Excel
            </button>
          </div>
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[9px] font-mono text-white/25 mr-0.5">BCG</span>
            {BCG_FILTERS.map(f => {
              const cfg = f === 'ALL' ? { color: '#888' } : f === 'UNASSIGNED' ? UNASSIGNED_META : QUADRANT_META[f]
              return <Chip key={f} active={bcgFilter === f} color={cfg.color} label={f === 'ALL' ? 'ALL' : cfg.emoji} onClick={() => { setBcgFilter(f); setPage(0) }} />
            })}
          </div>
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[9px] font-mono text-white/25 mr-0.5">Action</span>
            {ACTION_FILTERS.map(a => {
              const color = a === 'ALL' ? '#888' : (ACTION_META[a]?.color || '#888')
              return <Chip key={a} active={actionFilter === a} color={color} label={a} onClick={() => { setActionFilter(a); setPage(0) }} />
            })}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-3 py-3 text-left text-xs font-mono text-white/40">No</th>
              <HeadCell field="name" label="Product" />
              <HeadCell field="category" label="Category" />
              <HeadCell field="kod" label="Kod" />
              <HeadCell field="share_score" label="Share" />
              <HeadCell field="growth_score" label="Growth" />
              <HeadCell field="composite_score" label="Score" />
              <HeadCell field="price" label="Price" />
              <HeadCell field="bcg" label="BCG" />
              <HeadCell field="action" label="Action" />
            </tr>
          </thead>
          <tbody>
            {paginated.map((p, i) => {
              const cfg = QUADRANT_META[p.bcg_class] || UNASSIGNED_META
              const aColor = ACTION_META[p.recommendation?.action]?.color || '#888'
              return (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/3 transition-colors align-top">
                  <td className="px-3 py-3 font-mono text-xs text-white/30">{safePage * PAGE_SIZE + i + 1}</td>
                  <td className="px-4 py-3 max-w-sm">
                    <a href={p.url} target="_blank" rel="noreferrer"
                      className="font-medium text-white text-sm hover:text-gold inline-flex items-start gap-1 group">
                      {p.name}
                      <ExternalLink size={11} className="mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-60" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-white/50 font-mono whitespace-nowrap">{p.category}</td>
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
                  <td className="px-4 py-3 font-mono text-sm text-white whitespace-nowrap">{formatCurrency(p.price)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${cfg.color}15`, color: cfg.color }}>{cfg.emoji} {cfg.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.recommendation?.action ? (
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: `${aColor}15`, color: aColor }}>{p.recommendation.action}</span>
                    ) : (<span className="text-xs font-mono text-white/30">—</span>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-mono text-white/40">
          <span>{safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}</span>
          <div className="flex gap-1">
            <PageBtn onClick={() => setPage(0)} disabled={safePage === 0} title="İlk sayfa">«</PageBtn>
            <PageBtn onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>‹</PageBtn>
            {pageWindow.map(pg => <PageBtn key={pg} onClick={() => setPage(pg)} active={safePage === pg}>{pg + 1}</PageBtn>)}
            <PageBtn onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1}>›</PageBtn>
            <PageBtn onClick={() => setPage(totalPages - 1)} disabled={safePage === totalPages - 1} title="Son sayfa">»</PageBtn>
          </div>
        </div>
      )}
    </div>
  )
}
