import { useState, useMemo } from 'react'
import { Filter, X, Download, Search } from 'lucide-react'
import { QUADRANT_META, ACTION_META, formatCurrency, formatScore } from '../utils/helpers'

const UNASSIGNED_META = { label: 'ATANMADI', emoji: '∅', color: '#6B7280' }
const BCG_FILTERS = ['ALL', 'STAR', 'CASH_COW', 'QUESTION_MARK', 'DOG', 'UNASSIGNED']
const ACTION_FILTERS = ['ALL', 'INVEST', 'HARVEST', 'TEST', 'EXIT']
const STRING_SORT = new Set(['name', 'category', 'kod', 'bcg', 'action'])
const PAGE_SIZE = 10

// Sütun → ham metin (filtre + arama + export)
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
function sortVal(p, field) {
  if (STRING_SORT.has(field)) return String(colText(p, field))
  return colText(p, field)
}
// Sayı/binlik ayraç duyarsız normalize: "₺11.650" / "11.650" / "11650" eşitlenir
const norm = (s) => String(s).toLowerCase().replace(/[.,\s₺]/g, '')

export default function ProductTable({ products }) {
  const [search, setSearch] = useState('')
  const [bcgFilter, setBcgFilter] = useState('ALL')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [colFilters, setColFilters] = useState({})   // { field: text }
  const [openCol, setOpenCol] = useState(null)        // açık filtre popup'ı
  const [sortField, setSortField] = useState('composite_score')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(0)

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir(STRING_SORT.has(field) ? 'asc' : 'desc') }
    setPage(0)
  }
  const setColFilter = (field, val) => { setColFilters(f => ({ ...f, [field]: val })); setPage(0) }

  const matchText = (cell, q) => {
    if (!q) return true
    const c = String(cell).toLowerCase()
    return c.includes(q.toLowerCase()) || norm(c).includes(norm(q))
  }

  const filtered = useMemo(() => {
    const q = search.trim()
    return products
      .filter(p => {
        // Genel arama: tüm sütunlar + formatlı fiyat (nokta-duyarsız)
        const hay = [
          colText(p, 'name'), colText(p, 'category'), colText(p, 'kod'),
          colText(p, 'bcg'), colText(p, 'action'),
          colText(p, 'share_score'), colText(p, 'growth_score'),
          colText(p, 'composite_score'), colText(p, 'price'), formatCurrency(p.price),
        ].join(' ')
        if (!matchText(hay, q)) return false
        // Sütun filtreleri (Excel tarzı)
        for (const [field, val] of Object.entries(colFilters)) {
          if (val && !matchText(colText(p, field), val)) return false
        }
        const matchBcg =
          bcgFilter === 'ALL' ? true
          : bcgFilter === 'UNASSIGNED' ? p.is_unassigned
          : p.bcg_class === bcgFilter
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
    const header = ['No', 'Ürün', 'Kategori', 'Kod', 'Share', 'Growth', 'Score', 'Price', 'BCG', 'Action']
    const rows = filtered.map((p, i) => [
      i + 1, p.name, p.category, p.kod || '', p.share_score ?? '', p.growth_score ?? '',
      p.composite_score ?? '', p.price ?? '', p.bcg_class || '', p.recommendation?.action || '',
    ])
    const esc = v => `"${String(v).replace(/"/g, '""')}"`
    const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'roomart-urunler.csv'
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
      style={{ borderColor: active ? '#d4a017' : 'rgba(255,255,255,0.1)', color: active ? '#d4a017' : 'rgba(255,255,255,0.5)' }}>
      {children}
    </button>
  )

  const HeadCell = ({ field, label }) => (
    <th className="relative px-4 py-3 text-left text-xs font-mono text-white/40 whitespace-nowrap select-none">
      <div className="flex items-center gap-1">
        <span className="cursor-pointer hover:text-white/70" onClick={() => toggleSort(field)}>
          {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </span>
        <button onClick={() => setOpenCol(openCol === field ? null : field)}
          title="Sütun filtresi"
          style={{ color: colFilters[field] ? '#d4a017' : undefined }}
          className={colFilters[field] ? '' : 'text-white/20 hover:text-white/50'}>
          <Filter size={11} />
        </button>
      </div>
      {openCol === field && (
        <div className="absolute left-2 top-full z-50 mt-1 w-44 rounded-lg border border-white/10 bg-navy-900/98 p-2 shadow-2xl backdrop-blur-xl">
          <div className="relative">
            <input autoFocus value={colFilters[field] || ''} onChange={e => setColFilter(field, e.target.value)}
              placeholder={`${label} filtrele…`}
              className="w-full pr-6 px-2 py-1 text-xs font-mono bg-white/5 border border-white/10 rounded text-white placeholder-white/25 focus:outline-none focus:border-gold/40" />
            {colFilters[field] && (
              <button onClick={() => setColFilter(field, '')} className="absolute right-1 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><X size={12} /></button>
            )}
          </div>
        </div>
      )}
    </th>
  )

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
              {search && (
                <button onClick={() => { setSearch(''); setPage(0) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><X size={13} /></button>
              )}
            </div>
            <button onClick={exportCSV} title="Filtreli veriyi Excel/CSV olarak indir"
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
                  <td className="px-4 py-3 font-medium text-white text-sm max-w-sm">{p.name}</td>
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
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${cfg.color}15`, color: cfg.color }}>
                      {cfg.emoji} {cfg.label}
                    </span>
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
