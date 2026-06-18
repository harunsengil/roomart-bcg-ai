import { useState, useMemo, useRef, useCallback, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { Swords, Search, ExternalLink, X, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { QUADRANT_META, formatCurrency, tone } from '../utils/helpers'
import { useIsLight } from '../hooks/useTheme'

const BCG_SHORT = { STAR: 'STAR', CASH_COW: 'CC', QUESTION_MARK: 'QM', DOG: 'DOG' }

// Tek vurgu rengi = yıldız sarısı (gold-400). Hiçbir yerde iki farklı sarı yok.
const HI_CELL = 'text-gold-400 font-semibold'

// Akıllı arama yardımcıları
const norm = (s) => String(s).toLowerCase().replace(/[.,\s₺]/g, '')
const cellMatch = (cell, q) => {
  const c = String(cell).toLowerCase()
  return c.includes(q.toLowerCase()) || norm(c).includes(norm(q))
}
const num = (s) => Number(String(s).replace(/[.,₺\s]/g, ''))
function priceOp(q) {
  const s = q.replace(/[₺\s]/g, '')
  let m = s.match(/^(>=|<=|>|<)(\d[\d.,]*)$/)
  if (m) {
    const n = num(m[2]), op = m[1]
    return (p) => p != null && (op === '>' ? p > n : op === '<' ? p < n : op === '>=' ? p >= n : p <= n)
  }
  m = s.match(/^(\d[\d.,]*)[-–](\d[\d.,]*)$/)
  if (m) {
    const a = Math.min(num(m[1]), num(m[2])), b = Math.max(num(m[1]), num(m[2]))
    return (p) => p != null && p >= a && p <= b
  }
  return null
}

const SIM_FORMULA = '%40 görsel (CLIP) + %30 ad-token örtüşmesi (Jaccard) + %30 fiyat yakınlığı'

const T = {
  urun: 'Bu markanın bu kategorideki taranan ürün sayısı',
  fiyat: 'Markanın bu kategorideki ortalama satış fiyatı',
  urunFiyat: 'Ürünün güncel satış fiyatı (Trendyol). Bizim satırda RoomArt fiyatı, rakip satırlarda o rakip ürünün fiyatı.',
  puan: 'Ortalama müşteri puanı (0-5)',
  yorum: 'Toplam değerlendirme (yorum) sayısı — gerçek satış yerine talep/görünürlük vekili',
  yorumPct: 'Bu markanın kategorideki tüm yorumların yüzdesi (pazar görünürlüğü payı)',
  hiz: 'Bu haftaki yorum artışı (talep ivmesi). En az 2 haftalık veri birikince dolar.',
  endeks: 'Fiyat Endeksi = bu markanın kategori içi ort. fiyatı ÷ tüm markaların ort. fiyatı.\n\n1.74× → ortalamadan %74 PAHALI (kırmızı) — premium konum; yüksek puan/yorum eşliğinde iyidir, yoksa satışı köstekliyor olabilir.\n0.66× → ortalamadan %34 UCUZ (yeşil) — bütçe konumu; hacim stratejisine uygunsa pozitif, marjı eritiyorsa dikkat.\n1.00× → tam kategori ortalamasında.\n\nSadece tek kategori seçiliyken gösterilir; kategoriler arası fiyat çok farklılaştığı için "Tüm Markalar" görünümünde yoktur.',
  simHead: `Benzerlik skoru = ${SIM_FORMULA}. Bu kolon, ürünün EN YAKIN rakibinin skoruyla sıralanır (artan = en zayıf eşleşmeler üstte).`,
  simCell: `Bu rakip ürünün RoomArt ürününe benzerlik skoru = ${SIM_FORMULA}. Yüksek = ürünler daha benzer.`,
  delta: 'Rakip fiyatı − bizim fiyat. Kırmızı = rakip daha ucuz (altımızda).',
  fiyatMin: 'Gruptaki EN DÜŞÜK fiyat vurgulanır (altın). Düşük fiyat = rekabetçi konum.',
  puanMax: 'Gruptaki EN YÜKSEK puan vurgulanır (altın).',
}

function StoreLink({ brand, url, isRoomart }) {
  const label = isRoomart ? '★ ROOMART' : brand
  if (!url) return <span style={{ color: isRoomart ? 'var(--gold)' : 'var(--text-primary)' }} className="font-medium">{label}</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" title={`${brand} mağazasına git`}
      className="font-medium hover:text-gold inline-flex items-center gap-1"
      style={{ color: isRoomart ? 'var(--gold)' : 'var(--text-primary)' }}>
      {label}<ExternalLink size={10} className="text-white/25 flex-shrink-0" />
    </a>
  )
}

// ── Sıralanabilir başlık — hem Kategori hem Ürün görünümünde kullanılır ──────────
function SortHead({ field, label, align = 'center', tip, sort, onSort }) {
  const active = sort.field === field
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown
  const justify = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center'
  if (!field) return <span className={`flex ${justify}`} title={tip}>{label}</span>
  return (
    <button type="button" onClick={() => onSort(field)} title={tip}
      className={`flex items-center gap-1 ${justify} w-full hover:text-gold transition-colors ${active ? 'text-gold-400' : ''}`}>
      {label}<Icon size={11} className={active ? 'text-gold-400' : 'text-white/25'} />
    </button>
  )
}

// ── KATEGORİ + MARKA(toplam) GÖRÜNÜMÜ ─────────────────────────────────────────
function CategoryView({ categories }) {
  const ALL = '__all__'
  const [sel, setSel] = useState(categories[0]?.category)
  const [sort, setSort] = useState({ field: 'total_reviews', dir: 'desc' })

  const toggleSort = (field) => setSort(s =>
    s.field === field
      ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: field === 'brand' ? 'asc' : 'desc' }
  )

  const brandTotals = useMemo(() => {
    const map = {}
    categories.forEach(c => c.brands.forEach(b => {
      const m = map[b.brand] || (map[b.brand] = {
        brand: b.brand, is_roomart: b.is_roomart, store_url: b.store_url,
        product_count: 0, total_reviews: 0, cats: 0, _pS: 0, _pW: 0, _rS: 0, _rW: 0,
      })
      m.product_count += b.product_count
      m.total_reviews += b.total_reviews
      m.cats += 1
      if (b.avg_price) { m._pS += b.avg_price * b.product_count; m._pW += b.product_count }
      if (b.avg_rating) { m._rS += b.avg_rating * b.product_count; m._rW += b.product_count }
    }))
    const totalReviews = Object.values(map).reduce((s, m) => s + m.total_reviews, 0)
    return Object.values(map).map(m => ({
      ...m,
      avg_price: m._pW ? Math.round(m._pS / m._pW) : null,
      avg_rating: m._rW ? +(m._rS / m._rW).toFixed(2) : null,
      review_share: totalReviews ? +(m.total_reviews / totalReviews * 100).toFixed(1) : 0,
    }))
  }, [categories])

  const isAll = sel === ALL
  const cat = categories.find(c => c.category === sel)

  const rows = useMemo(() => {
    const base = isAll ? brandTotals : (cat?.brands || [])
    const f = sort.field || 'total_reviews'
    const d = sort.dir || 'desc'
    return [...base].sort((a, b) => {
      const va = a[f], vb = b[f]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const r = typeof va === 'string' ? String(va).localeCompare(String(vb), 'tr') : (va - vb)
      return d === 'asc' ? r : -r
    })
  }, [sel, isAll, brandTotals, cat, sort])

  // En yüksek puan + yorum, en düşük fiyat vurgulanır (gold-400).
  const maxOf = (key) => { const v = rows.map(b => b[key]).filter(v => v != null && v > 0); return v.length ? Math.max(...v) : null }
  const minOf = (key) => { const v = rows.map(b => b[key]).filter(v => v != null && v > 0); return v.length ? Math.min(...v) : null }
  const mx = { avg_price: minOf('avg_price'), avg_rating: maxOf('avg_rating'), total_reviews: maxOf('total_reviews') }

  const sh = (field, label, align = 'right', tip) => (
    <th className={`px-3 py-2.5 text-${align}`}>
      <SortHead field={field} label={label} align={align} tip={tip} sort={sort} onSort={toggleSort} />
    </th>
  )

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
        <button onClick={() => setSel(ALL)}
          className="px-3 py-1.5 text-xs font-mono rounded-lg border transition-all"
          style={{
            borderColor: isAll ? 'var(--gold)' : 'var(--border-subtle)',
            color: isAll ? 'var(--gold)' : 'var(--text-secondary)',
            background: isAll ? 'var(--gold)15' : 'transparent',
          }}>
          ⊕ Tüm Markalar
        </button>
        <span className="self-center text-white/15">|</span>
        {categories.map(c => (
          <button key={c.category} onClick={() => setSel(c.category)}
            className="px-3 py-1.5 text-xs font-mono rounded-lg border transition-all"
            style={{
              borderColor: c.category === sel ? 'var(--gold)' : 'var(--border-subtle)',
              color: c.category === sel ? 'var(--gold)' : 'var(--text-secondary)',
              background: c.category === sel ? 'var(--gold)15' : 'transparent',
            }}>
            {c.category} <span className="text-white/30">· {c.competitor_brands}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-xs font-mono text-white/50 mb-2 flex-shrink-0">
        {isAll
          ? <span>Markaların <b className="text-white/80">tüm kategoriler toplamı</b></span>
          : <>
            <span>Yorum lideri: <b className="text-white/80">{cat?.leader}</b></span>
            {cat?.roomart_rank && <span>· RoomArt sıra: <b className="text-gold-400">{cat.roomart_rank}/{cat.brands.length}</b></span>}
          </>}
      </div>

      <div className="overflow-y-auto overflow-x-auto rounded-lg border border-white/5" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table className="w-full text-sm min-w-[640px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-white/10 text-[11px] font-mono text-white/40 text-left" style={{ background: 'var(--bg-card)' }}>
              <th className="px-3 py-2.5 w-8">#</th>
              <th className="px-3 py-2.5">
                <SortHead field="brand" label="Marka" align="left" tip="Marka adına göre sırala" sort={sort} onSort={toggleSort} />
              </th>
              {isAll && <th className="px-3 py-2.5 text-right" title="Markanın ürün sattığı kategori sayısı (6 üzerinden)">Kategori</th>}
              {sh('product_count', 'Ürün', 'right', T.urun)}
              {sh('avg_price', 'Ort. Fiyat', 'right', T.fiyat + ' · En düşük altın.')}
              {sh('avg_rating', 'Ort. Puan', 'right', T.puan + ' · En yüksek altın.')}
              {sh('total_reviews', 'Yorum', 'right', T.yorum + ' · En yüksek altın.')}
              {sh('review_share', 'Yorum %', 'right', T.yorumPct)}
              {!isAll && sh('review_velocity', 'Hız', 'right', T.hiz)}
              {!isAll && sh('price_index', 'Fiyat Endeksi', 'right', T.endeks)}
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.brand} className={`zebra-row border-b border-white/5 transition-colors ${b.is_roomart ? 'border-l-2 border-l-gold' : ''}`}>
                <td className="px-3 py-2 font-mono text-white/30">{i + 1}</td>
                <td className="px-3 py-2"><StoreLink brand={b.brand} url={b.store_url} isRoomart={b.is_roomart} /></td>
                {isAll && <td className="px-3 py-2 text-right font-mono text-white/50">{b.cats}/6</td>}
                <td className="px-3 py-2 text-right font-mono text-white/70">{b.product_count}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {b.avg_price != null
                    ? <span className={b.avg_price === mx.avg_price ? HI_CELL : 'text-white'}>{formatCurrency(b.avg_price)}</span>
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {b.avg_rating != null
                    ? <span className={b.avg_rating === mx.avg_rating ? HI_CELL : 'text-white/70'}>★ {b.avg_rating}</span>
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {b.total_reviews > 0
                    ? <span className={b.total_reviews === mx.total_reviews ? HI_CELL : 'text-white/70'}>{b.total_reviews}</span>
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-white/60">%{b.review_share}</td>
                {!isAll && <td className="px-3 py-2 text-right font-mono">{b.review_velocity > 0 ? <span className="text-cyan-300">+{b.review_velocity}</span> : <span className="text-white/25">—</span>}</td>}
                {!isAll && <td className="px-3 py-2 text-right font-mono">{b.price_index != null ? <span className={b.price_index > 1 ? 'text-rose-300' : 'text-emerald-300'}>{b.price_index}×</span> : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Hover görsel popup — DOM-direct, React state yok → re-render yok ─────────
const HoverImgPopup = forwardRef(function HoverImgPopup(_, ref) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div ref={ref} className="pointer-events-none rounded-lg border border-white/15 p-2 shadow-2xl backdrop-blur-xl"
      style={{ display: 'none', position: 'fixed', zIndex: 100, width: 230, background: 'var(--bg-secondary)' }}>
      <img alt="" className="w-full h-[190px] object-contain rounded bg-white/5" />
      <div data-cap className="text-[10px] font-mono text-white/60 mt-1.5 line-clamp-2" />
    </div>,
    document.body
  )
})

// ── ÜRÜN GÖRÜNÜMÜ ──────────────────────────────────────────────────────────────
const GRID = 'grid grid-cols-[minmax(0,1fr)_104px_88px_64px_76px_84px_120px] items-center'

const bestSim = (m) => m.competitors.length ? Math.max(...m.competitors.map(c => c.score || 0)) : 0
const sortVal = (m, f) => {
  switch (f) {
    case 'name':    return m.our_name || ''
    case 'price':   return m.our_price ?? -Infinity
    case 'rating':  return m.our_rating ?? -Infinity
    case 'reviews': return m.our_reviews ?? -Infinity
    case 'category': return m.category || ''
    case 'sim':     return bestSim(m)
    default:        return 0
  }
}
const STR_FIELDS = new Set(['name', 'category'])

function ProductView({ matches, light }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ field: null, dir: 'asc' })
  const popupRef = useRef(null)

  // DOM-direct: hover → no React state change → no list re-render (407 rows × 4 = ~1600 elements)
  const showImg = useCallback((e, src, name) => {
    const el = popupRef.current
    if (!el || !src) return
    const row = e.currentTarget.closest('.cmp-prow')
    const r = (row || e.currentTarget).getBoundingClientRect()
    const x = row ? r.right - 548 : r.right
    const W = 230, H = 250, vh = window.innerHeight
    el.style.left = `${Math.max(8, x - W - 8)}px`
    el.style.top  = `${Math.min(Math.max(8, r.top - 20), vh - H - 8)}px`
    el.style.display = 'block'
    const img = el.querySelector('img')
    if (img && img.getAttribute('data-src') !== src) { img.src = src; img.setAttribute('data-src', src) }
    const cap = el.querySelector('[data-cap]')
    if (cap) cap.textContent = name
  }, [])
  const hideImg = useCallback(() => { if (popupRef.current) popupRef.current.style.display = 'none' }, [])

  const toggleSort = (field) => setSort(s =>
    s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })

  const filtered = useMemo(() => {
    const query = q.trim()
    const op = query ? priceOp(query) : null
    const out = matches.filter(m => {
      if (op) return op(m.our_price)
      if (!query) return true
      const hay = [m.our_name, m.category, ...m.competitors.flatMap(c => [c.brand, c.name])]
      return hay.some(h => cellMatch(h, query)) || cellMatch(formatCurrency(m.our_price), query)
    })
    if (sort.field) {
      const isStr = STR_FIELDS.has(sort.field)
      out.sort((a, b) => {
        const va = sortVal(a, sort.field), vb = sortVal(b, sort.field)
        const r = isStr ? String(va).localeCompare(String(vb), 'tr') : va - vb
        return sort.dir === 'asc' ? r : -r
      })
    }
    return out
  }, [matches, q, sort])

  return (
    <>
      <HoverImgPopup ref={popupRef} />
      <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <div className="relative max-w-md flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Ara: ürün, kategori, rakip marka… veya >3500, <2000, 1000-5000"
            className="pl-7 pr-7 py-1.5 text-xs font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-gold/40 w-full" />
          {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><X size={13} /></button>}
        </div>
        <span className="text-[11px] font-mono text-white/30 whitespace-nowrap">{filtered.length} ürün · en yakın 3 rakip</span>
      </div>

      {/* overflow-x-auto → mobilde yatay kaydırılır; min-w → kolon genişlikleri korunur */}
      <div className="overflow-y-auto overflow-x-auto" style={{ maxHeight: 'calc(100vh - 380px)' }}>
        <div className="min-w-[640px]">
        <div className={`${GRID} sticky top-0 z-10 px-3 py-2 text-[11px] font-mono text-white/40 border-x border-transparent border-b border-white/10`} style={{ background: 'var(--bg-card)' }}>
          <SortHead field="name"     label="Ürün / Rakip" align="left"   tip="RoomArt ürün adına göre sırala"  sort={sort} onSort={toggleSort} />
          <SortHead field="price"    label="Fiyat"        align="right"  tip={`${T.urunFiyat} ${T.fiyatMin}`} sort={sort} onSort={toggleSort} />
          <span className="text-center" title={T.delta}>Fiyat Farkı</span>
          <SortHead field="rating"   label="Puan"         align="center" tip={`${T.puan} ${T.puanMax}`}       sort={sort} onSort={toggleSort} />
          <SortHead field="reviews"  label="Yorum"        align="center" tip={T.yorum}                        sort={sort} onSort={toggleSort} />
          <SortHead field="sim"      label="Benzerlik"    align="center" tip={T.simHead}                      sort={sort} onSort={toggleSort} />
          <SortHead field="category" label="Kategori"     align="center" tip="Kategoriye göre grupla/sırala"  sort={sort} onSort={toggleSort} />
        </div>

        <div className="space-y-2 pt-2">
          {filtered.map(m => {
            const cfgRaw = QUADRANT_META[m.bcg_class] || { color: '#6B7280' }
            const cfg = { ...cfgRaw, color: tone(cfgRaw.color, light) }
            // En düşük fiyat altın; en yüksek puan + yorum altın.
            const allPrices = [m.our_price, ...m.competitors.map(c => c.price)].filter(p => p && p > 0)
            const gp = allPrices.length ? Math.min(...allPrices) : -1
            const gr = Math.max(m.our_rating || 0, ...m.competitors.map(c => c.rating || 0))
            const gv = Math.max(m.our_reviews || 0, ...m.competitors.map(c => c.reviews || 0))
            return (
              <div key={m.our_id} className="rounded-lg border border-white/10 overflow-hidden">
                {/* bizim ürün */}
                <div className={`cmp-prow ${GRID} px-3 py-2 hover:bg-white/[0.03] transition-colors`} style={{ background: 'var(--gold)0d' }}>
                  <a href={m.our_url} target="_blank" rel="noreferrer"
                    className="font-medium text-white hover:text-gold flex items-center gap-1 min-w-0 overflow-hidden"
                    onMouseEnter={e => showImg(e, m.our_image, m.our_name)} onMouseLeave={hideImg}>
                    <span className="flex-1 min-w-0 truncate">★ {m.our_name}</span>
                    <ExternalLink size={10} className="text-white/25 flex-shrink-0" />
                  </a>
                  <span className="text-right font-mono">
                    {m.our_price != null
                      ? <span className={m.our_price === gp && gp > 0 ? HI_CELL : 'text-white'}>{formatCurrency(m.our_price)}</span>
                      : '—'}
                  </span>
                  <span className="text-right font-mono text-white/30">—</span>
                  <span className="text-right font-mono text-white/70">
                    {m.our_rating > 0
                      ? <span className={m.our_rating === gr ? HI_CELL : ''}>★ {m.our_rating}</span>
                      : '—'}
                  </span>
                  <span className="text-right font-mono text-white/70">
                    {m.our_reviews > 0
                      ? <span className={m.our_reviews === gv ? HI_CELL : ''}>{m.our_reviews}</span>
                      : m.our_reviews}
                  </span>
                  <span className="text-right font-mono text-white/30">—</span>
                  <span className="text-left pl-2 truncate">
                    <span className="text-[10px] font-mono text-white/40">{m.category}</span>
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono"
                      style={{ background: `${cfg.color}15`, color: cfg.color }}>{m.bcg_class ? BCG_SHORT[m.bcg_class] : '—'}</span>
                  </span>
                </div>
                {/* rakipler */}
                {m.competitors.map((c, i) => (
                  <div key={i} className={`cmp-prow ${GRID} px-3 py-1.5 text-white/70 hover:bg-white/[0.04] transition-colors border-t border-white/5 ${i % 2 ? 'bg-white/[0.015]' : ''}`}>
                    <a href={c.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 hover:text-gold min-w-0 overflow-hidden pl-3"
                      onMouseEnter={e => showImg(e, c.image, c.name)} onMouseLeave={hideImg}>
                      <span className="text-white/40 font-mono flex-shrink-0">{c.brand}</span>
                      <span className="flex-1 min-w-0 truncate">{c.name}</span>
                      <ExternalLink size={9} className="flex-shrink-0 text-white/20" />
                    </a>
                    <span className="text-right font-mono">
                      {c.price != null
                        ? <span className={c.price === gp && gp > 0 ? HI_CELL : 'text-white/80'}>{formatCurrency(c.price)}</span>
                        : '—'}
                    </span>
                    <span className="text-right font-mono">
                      {c.price_delta_pct == null ? '—'
                        : <span className={c.price_delta_pct < 0 ? 'text-rose-400' : c.price_delta_pct > 0 ? 'text-emerald-400' : 'text-white/40'}>
                            {c.price_delta_pct > 0 ? '+' : ''}%{c.price_delta_pct}
                          </span>}
                    </span>
                    <span className="text-right font-mono text-white/60">
                      {c.rating > 0
                        ? <span className={c.rating === gr ? HI_CELL : ''}>{c.rating}★</span>
                        : '—'}
                    </span>
                    <span className="text-right font-mono text-white/50">
                      {c.reviews > 0
                        ? <span className={c.reviews === gv ? HI_CELL : ''}>{c.reviews}</span>
                        : c.reviews}
                    </span>
                    <span className="text-right font-mono text-white/40" title={T.simCell}>{Math.round(c.score * 100)}%</span>
                    <span className="text-left pl-2"></span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        </div>{/* min-w */}
      </div>
    </div>
    </>
  )
}

export default function CompetitionTab({ data }) {
  const light = useIsLight()
  const [view, setView] = useState('kategori')

  if (!data || !data.categories?.length) {
    return (
      <div className="card p-10 text-center">
        <Swords size={28} className="mx-auto text-white/20 mb-3" />
        <p className="text-white/50 font-mono text-sm">Rakip verisi henüz toplanıyor.</p>
      </div>
    )
  }

  const md = data.metadata || {}
  return (
    <div className="card p-5 flex flex-col" style={{ minHeight: 'calc(100vh - 200px)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h2 className="font-display text-xl text-white font-semibold flex items-center gap-2">
            <Swords size={18} className="text-gold-400" /> Competition
          </h2>
          <p className="text-[11px] text-white/40 font-mono mt-0.5">
            {md.competitor_products} rakip ürün · {md.latest_snapshot} · <span className="text-amber-300/70">yorum-tabanlı (BCG gerçek-satıştan ayrı)</span>
            {!md.has_velocity && ' · yorum-hızı için veri birikiyor'}
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {['kategori', 'urun'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-1.5 text-xs font-mono rounded-lg border transition-all"
              style={{
                borderColor: view === v ? 'var(--gold)' : 'var(--border-subtle)',
                color: view === v ? 'var(--gold)' : 'var(--text-secondary)',
                background: view === v ? 'var(--gold)15' : 'transparent',
              }}>
              {v === 'kategori' ? 'Kategori' : 'Ürün'}
            </button>
          ))}
        </div>
      </div>

      {view === 'kategori'
        ? <CategoryView categories={data.categories} />
        : <ProductView matches={data.matches || []} light={light} />}
    </div>
  )
}
