import { useState, useMemo, useEffect, useRef } from 'react'
import { Filter, X, Download, Search } from 'lucide-react'
import { QUADRANT_META, ACTION_META, formatCurrency, formatScore, tone } from '../utils/helpers'
import { useIsLight } from '../hooks/useTheme'

// Defensif fallback (DİĞER dahil tüm ürünler artık skorlu; bcg_class boşsa nadiren)
const FALLBACK_META = { label: '—', emoji: '', color: '#6B7280' }
// Tabloda kompakt BCG rozeti (tam ad title'da): QUESTION MARK gibi uzun etiketler dar kolona sığmaz.
const BCG_SHORT = { STAR: 'STAR', CASH_COW: 'CC', QUESTION_MARK: 'QM', DOG: 'DOG' }
// Sağ yarıdaki kolonların filtre açılır menüsü sağa yaslanır (overflow-x-hidden kırpmasın).
const DROP_RIGHT = new Set(['price', 'list_price', 'discount', 'stock', 'bcg', 'action'])
const BCG_FILTERS = ['ALL', 'STAR', 'CASH_COW', 'QUESTION_MARK', 'DOG']
const ACTION_FILTERS = ['ALL', 'INVEST', 'HARVEST', 'TEST', 'EXIT']
const STRING_SORT = new Set(['name', 'category', 'category_name', 'color', 'kod', 'bcg', 'action'])
const SEARCH_FIELDS = ['name', 'category', 'category_name', 'color', 'kod', 'bcg', 'action', 'share_score', 'growth_score', 'composite_score', 'rating', 'review_count', 'price', 'list_price', 'discount', 'stock']
const PAGE_SIZE = 100

function colText(p, field) {
  switch (field) {
    case 'name': return p.name || ''
    case 'category': return p.category || ''
    case 'category_name': return p.category_name || ''
    case 'color': return p.color || ''
    case 'kod': return p.kod || ''
    case 'share_score': return p.share_score ?? ''
    case 'growth_score': return p.growth_score ?? ''
    case 'composite_score': return p.composite_score ?? ''
    case 'rating': return p.rating ?? ''
    case 'review_count': return p.review_count ?? ''
    // GÖRÜNEN (yuvarlanmış) fiyat — ham 13669.9 değil; "6699" yanlış substring eşleşmesini önler
    case 'price': return p.price == null ? '' : Math.round(p.price)
    case 'list_price': return p.list_price == null ? '' : Math.round(p.list_price)
    case 'discount': return p.discount ?? ''
    case 'stock': return p.stock ?? ''
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
// Sayısal operatör → FİYATA uygulanır. ">3500", "<2000", ">=5000", "1000-5000" (aralık).
// Operatör yoksa null döner → normal metin araması (kod "1773" araması bozulmaz).
const num = (s) => Number(String(s).replace(/[.,₺\s]/g, ''))
function priceOp(q) {
  const s = q.replace(/[₺\s]/g, '')
  let m = s.match(/^(>=|<=|>|<)(\d[\d.,]*)$/)
  if (m) {
    const n = num(m[2]), op = m[1]
    return (price) => price != null && (
      op === '>' ? price > n : op === '<' ? price < n : op === '>=' ? price >= n : price <= n
    )
  }
  m = s.match(/^(\d[\d.,]*)[-–](\d[\d.,]*)$/)
  if (m) {
    const a = Math.min(num(m[1]), num(m[2])), b = Math.max(num(m[1]), num(m[2]))
    return (price) => price != null && price >= a && price <= b
  }
  return null
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
  const scrollBoxRef = useRef(null)
  const didMount = useRef(false)
  const light = useIsLight()
  const goPage = (p) => setPage(p)

  // Sayfa değişince tablo kutusunu başa sar → yeni sayfa 1. satırdan.
  // Çift rAF: daha KISA sayfaya geçişte (örn. 100→87 satır) tarayıcı scrollTop'u 1. frame'de
  // aşağı CLAMP eder; bu clamp bekleyen smooth scroll'u iptal ediyordu (ileri sayfada en alta
  // atıyordu). 1. frame clamp'i bitirsin, smooth'u 2. frame'de temiz başlat.
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return }
    const el = scrollBoxRef.current
    if (!el) return
    let r2
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => el.scrollTo({ top: 0, behavior: 'smooth' }))
    })
    return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2) }
  }, [page])

  // Filtre popup'ı: dış alana tıklayınca kapansın
  useEffect(() => {
    if (openCol == null) return
    const onDown = (e) => { if (!e.target.closest('[data-colfilter]')) setOpenCol(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openCol])

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
    const op = q ? priceOp(q) : null
    return products
      .filter(p => {
        if (op) { if (!op(p.price)) return false }
        else if (q && !(SEARCH_FIELDS.some(f => cellMatch(colText(p, f), q)) || cellMatch(formatCurrency(p.price), q))) return false
        for (const [field, vals] of Object.entries(colFilters)) {
          if (vals && vals.length && !vals.includes(String(colText(p, field)))) return false
        }
        const matchBcg = bcgFilter === 'ALL' ? true : p.bcg_class === bcgFilter
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
    const header = ['No', 'Ürün', 'Kategori', 'Trendyol Kat.', 'Renk', 'Kod', 'Share', 'Growth', 'Score', 'Puan', 'Yorum', 'Price', 'Liste', 'İndirim %', 'Stok', 'BCG', 'Action', 'URL']
    const rows = filtered.map((p, i) => [
      i + 1, p.name, p.category, p.category_name || '', p.color || '', p.kod || '', p.share_score ?? '', p.growth_score ?? '',
      p.composite_score ?? '', p.rating ?? '', p.review_count ?? '', p.price ?? '', p.list_price ?? '', p.discount ?? '', p.stock ?? '', p.bcg_class || '', p.recommendation?.action || '', p.url || '',
    ])
    const esc = v => `"${String(v).replace(/"/g, '""')}"`
    const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'roomart-urunler.csv'
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  const Chip = ({ active, color, label, onClick }) => (
    <button onClick={onClick} className="px-2 py-1 text-xs font-mono rounded border transition-all"
      style={{ borderColor: active ? color : 'var(--border-subtle)', color: active ? color : 'var(--text-secondary)', background: active ? color + '15' : 'transparent' }}>
      {label}
    </button>
  )
  const PageBtn = ({ onClick, disabled, active, children, title }) => (
    <button onClick={onClick} disabled={disabled} title={title}
      className="px-2 py-1 rounded border transition-all disabled:opacity-30 hover:border-gold/40 hover:text-gold"
      style={{ borderColor: active ? 'var(--gold)' : 'var(--border-subtle)', color: active ? 'var(--gold)' : 'var(--text-secondary)' }}>{children}</button>
  )

  const HeadCell = ({ field, label }) => {
    const sel = colFilters[field] || []
    const cs = (colSearch[field] || '').toLowerCase()
    const values = openCol === field ? distinctValues(field).filter(v => !cs || v.toLowerCase().includes(cs) || norm(v).includes(norm(cs))) : []
    return (
      <th className="relative px-2 py-2.5 text-xs font-mono text-white/40 break-words select-none align-top text-left">
        {/* Üst satır: yalnız etiket (tıkla = sırala). Sıralama oku burada DEĞİL → etiket
            satırı asla sarmaz/kaymaz. Alt satır: filtre + sıralama oku (her zaman solda). */}
        <div className="flex flex-col gap-1.5">
          <span className="cursor-pointer hover:text-white/70 break-words" onClick={() => toggleSort(field)} title="Sırala">
            {label}
          </span>
          <div className="flex items-center gap-1">
            <button data-colfilter onClick={() => setOpenCol(openCol === field ? null : field)} title="Sütun filtresi"
              style={{ color: sel.length ? '#d4a017' : undefined }} className={sel.length ? 'flex-shrink-0' : 'flex-shrink-0 text-white/25 hover:text-white/60'}>
              <Filter size={11} />
              {sel.length > 0 && <span className="ml-0.5 text-[8px]">{sel.length}</span>}
            </button>
            {/* sabit genişlikli ok yuvası → ok görünüp kaybolunca hiçbir kayma olmaz */}
            <span className="w-2.5 text-center text-white/60 text-[11px] leading-none">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}</span>
          </div>
        </div>
        {openCol === field && (
          <div data-colfilter className={`absolute top-full z-50 mt-1 w-52 rounded-lg border border-white/10 p-2 shadow-2xl backdrop-blur-xl ${DROP_RIGHT.has(field) ? 'right-2' : 'left-2'}`}
            style={{ background: 'var(--bg-secondary)' }}>
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
                      style={{ borderColor: checked ? 'var(--gold)' : 'var(--text-muted)', background: checked ? 'var(--gold)' : 'transparent' }}>
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
        <div className="flex flex-col gap-2 xl:items-end w-full xl:w-auto">
          <div className="flex gap-2 items-center w-full xl:w-auto">
            <div className="relative flex-1 xl:flex-none">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
                placeholder="Ara: ad, kod, BCG… veya >3500, <2000, 1000-5000"
                className="pl-7 pr-7 py-1.5 text-xs font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-gold/40 w-full xl:w-72" />
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
              const cfg = f === 'ALL' ? { color: '#888' } : QUADRANT_META[f]
              return <Chip key={f} active={bcgFilter === f} color={tone(cfg.color, light)} label={f === 'ALL' ? 'ALL' : cfg.emoji} onClick={() => { setBcgFilter(f); setPage(0) }} />
            })}
          </div>
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[9px] font-mono text-white/25 mr-0.5">Action</span>
            {ACTION_FILTERS.map(a => {
              const color = tone(a === 'ALL' ? '#888' : (ACTION_META[a]?.color || '#888'), light)
              return <Chip key={a} active={actionFilter === a} color={color} label={a} onClick={() => { setActionFilter(a); setPage(0) }} />
            })}
          </div>
        </div>
      </div>

      <div ref={scrollBoxRef} className="overflow-y-auto overflow-x-hidden rounded-lg border border-white/5"
        style={{ maxHeight: 'calc(100vh - 360px)' }}>
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '3%' }} />{/* No */}
            <col style={{ width: '17%' }} />{/* Product */}
            <col style={{ width: '8%' }} />{/* Category */}
            <col style={{ width: '7%' }} />{/* Trendyol Kat. */}
            <col style={{ width: '6%' }} />{/* Renk */}
            <col style={{ width: '5%' }} />{/* Kod */}
            <col style={{ width: '4%' }} />{/* Share */}
            <col style={{ width: '4%' }} />{/* Growth */}
            <col style={{ width: '7%' }} />{/* Score */}
            <col style={{ width: '4%' }} />{/* Puan */}
            <col style={{ width: '4%' }} />{/* Yorum (review_count) */}
            <col style={{ width: '6%' }} />{/* Price */}
            <col style={{ width: '5%' }} />{/* Liste */}
            <col style={{ width: '6%' }} />{/* İndirim */}
            <col style={{ width: '4%' }} />{/* Stok */}
            <col style={{ width: '5%' }} />{/* BCG */}
            <col style={{ width: '5%' }} />{/* Action */}
          </colgroup>
          <thead className="sticky top-0 z-30">
            <tr className="border-b border-white/10" style={{ background: 'var(--bg-card)' }}>
              <th className="px-2 py-2.5 text-left text-xs font-mono text-white/40">No</th>
              <HeadCell field="name" label="Product" />
              <HeadCell field="category" label="Category" />
              <HeadCell field="category_name" label="Trendyol Kat." />
              <HeadCell field="color" label="Renk" />
              <HeadCell field="kod" label="Kod" />
              <HeadCell field="share_score" label="Share" />
              <HeadCell field="growth_score" label="Growth" />
              <HeadCell field="composite_score" label="Score" />
              <HeadCell field="rating" label="Puan" />
              <HeadCell field="review_count" label="Yorum" />
              <HeadCell field="price" label="Price" />
              <HeadCell field="list_price" label="Liste" />
              <HeadCell field="discount" label="İndirim" />
              <HeadCell field="stock" label="Stok" />
              <HeadCell field="bcg" label="BCG" />
              <HeadCell field="action" label="Action" />
            </tr>
          </thead>
          <tbody>
            {paginated.map((p, i) => {
              const cfgRaw = QUADRANT_META[p.bcg_class] || FALLBACK_META
              const cfg = { ...cfgRaw, color: tone(cfgRaw.color, light) }
              const aColor = tone(ACTION_META[p.recommendation?.action]?.color || '#888', light)
              return (
                <tr key={p.id} className="zebra-row border-b border-white/5 transition-colors align-top">
                  <td className="px-2 py-2.5 font-mono text-xs text-white/30">{safePage * PAGE_SIZE + i + 1}</td>
                  <td className="px-2 py-2.5">
                    <a href={p.url} target="_blank" rel="noreferrer" title={p.name}
                      className="font-medium text-white text-sm hover:text-gold line-clamp-3 break-words">
                      {p.name}
                    </a>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-white/50 font-mono break-words">{p.category}</td>
                  <td className="px-2 py-2.5 text-xs text-white/45 font-mono break-words">{p.category_name || '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-white/60 break-words" title={p.color || ''}>{p.color || '—'}</td>
                  <td className="px-2 py-2.5 font-mono text-xs text-white/60">{p.kod || '—'}</td>
                  <td className="px-2 py-2.5 font-mono text-sm text-white">{formatScore(p.share_score)}</td>
                  <td className="px-2 py-2.5 font-mono text-sm text-white">{formatScore(p.growth_score)}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 bg-white/10 rounded-full w-8 flex-shrink-0">
                        <div className="h-full rounded-full" style={{ width: `${p.composite_score ?? 0}%`, background: cfg.color }}></div>
                      </div>
                      <span className="font-mono text-xs text-white">{formatScore(p.composite_score)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-sm whitespace-nowrap">
                    {p.rating > 0 ? <span className="text-gold-400">★ {p.rating.toFixed(1)}</span> : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-sm text-white/70 whitespace-nowrap">
                    {p.review_count > 0 ? p.review_count : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-sm text-white whitespace-nowrap">{formatCurrency(p.price)}</td>
                  <td className="px-2 py-2.5 font-mono text-xs whitespace-nowrap">
                    {p.list_price != null && p.discount ? <span className="text-white/40 line-through">{formatCurrency(p.list_price)}</span> : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-sm whitespace-nowrap">
                    {p.discount ? <span className="text-emerald-400">−%{p.discount}</span> : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-2 py-2.5 font-mono text-sm whitespace-nowrap">
                    {p.stock != null ? <span className={p.stock > 0 ? 'text-white/70' : 'text-rose-400'}>{p.stock}</span> : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-2 py-2.5">
                    <span title={cfg.label} className="text-xs font-mono px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${cfg.color}15`, color: cfg.color }}>{cfg.emoji} {BCG_SHORT[p.bcg_class] || cfg.label}</span>
                  </td>
                  <td className="px-2 py-2.5">
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
        <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-1 flex items-center justify-between text-xs font-mono text-white/40 border-t border-white/5"
          style={{ background: 'var(--bg-card)' }}>
          <span>{safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} / {filtered.length}</span>
          <div className="flex gap-1">
            <PageBtn onClick={() => goPage(0)} disabled={safePage === 0} title="İlk sayfa">«</PageBtn>
            <PageBtn onClick={() => goPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>‹</PageBtn>
            {pageWindow.map(pg => <PageBtn key={pg} onClick={() => goPage(pg)} active={safePage === pg}>{pg + 1}</PageBtn>)}
            <PageBtn onClick={() => goPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage === totalPages - 1}>›</PageBtn>
            <PageBtn onClick={() => goPage(totalPages - 1)} disabled={safePage === totalPages - 1} title="Son sayfa">»</PageBtn>
          </div>
        </div>
      )}
    </div>
  )
}
