import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Swords, Search, ExternalLink, X } from 'lucide-react'
import { QUADRANT_META, formatCurrency, tone } from '../utils/helpers'
import { useIsLight } from '../hooks/useTheme'

const BCG_SHORT = { STAR: 'STAR', CASH_COW: 'CC', QUESTION_MARK: 'QM', DOG: 'DOG' }

// Akıllı arama yardımcıları (ProductTable ile aynı: binlik-ayraç duyarsız + fiyat operatörleri)
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

const T = {
  urun: 'Bu markanın bu kategorideki taranan ürün sayısı',
  fiyat: 'Markanın bu kategorideki ortalama satış fiyatı',
  puan: 'Ortalama müşteri puanı (0-5)',
  yorum: 'Toplam değerlendirme (yorum) sayısı — gerçek satış yerine talep/görünürlük vekili',
  yorumPct: 'Bu markanın kategorideki tüm yorumların yüzdesi (pazar görünürlüğü payı)',
  hiz: 'Bu haftaki yorum artışı (talep ivmesi). En az 2 haftalık veri birikince dolar.',
  endeks: 'Fiyat endeksi = marka ort. fiyatı ÷ kategori ort. fiyatı. Örn. 1.74× = ortalamadan %74 PAHALI; 0.66× = %34 UCUZ.',
  sim: 'Benzerlik skoru = 0.6 × ad-token örtüşmesi (Jaccard) + 0.4 × fiyat yakınlığı. Yüksek = ürünler daha benzer.',
  delta: 'Rakip fiyatı − bizim fiyat. Kırmızı = rakip daha ucuz (altımızda).',
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

// ── KATEGORİ + MARKA(toplam) GÖRÜNÜMÜ ─────────────────────────────────────────
function CategoryView({ categories }) {
  const ALL = '__all__'
  const [sel, setSel] = useState(categories[0]?.category)

  // Marka toplamı: her markanın TÜM kategorilerdeki birleşik metrikleri
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
    })).sort((a, b) => b.total_reviews - a.total_reviews)
  }, [categories])

  const cat = categories.find(c => c.category === sel)
  const isAll = sel === ALL
  const rows = isAll ? brandTotals : (cat?.brands || [])

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
          ? <span>Markaların <b className="text-white/80">tüm kategoriler toplamı</b> · yorum hacmine göre sıralı</span>
          : <>
            <span>Yorum lideri: <b className="text-white/80">{cat?.leader}</b></span>
            {cat?.roomart_rank && <span>· RoomArt sıra: <b className="text-gold">{cat.roomart_rank}/{cat.brands.length}</b></span>}
          </>}
      </div>

      <div className="overflow-y-auto overflow-x-hidden rounded-lg border border-white/5" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-white/10 text-[11px] font-mono text-white/40 text-left" style={{ background: 'var(--bg-card)' }}>
              <th className="px-3 py-2.5 w-8" title="Yorum hacmine göre sıra">#</th>
              <th className="px-3 py-2.5" title="Mağaza — tıkla, Trendyol mağazasına git">Marka</th>
              {isAll && <th className="px-3 py-2.5 text-right" title="Markanın ürün sattığı kategori sayısı (6 üzerinden)">Kategori</th>}
              <th className="px-3 py-2.5 text-right" title={T.urun}>Ürün</th>
              <th className="px-3 py-2.5 text-right" title={T.fiyat}>Ort. Fiyat</th>
              <th className="px-3 py-2.5 text-right" title={T.puan}>Ort. Puan</th>
              <th className="px-3 py-2.5 text-right" title={T.yorum}>Yorum</th>
              <th className="px-3 py-2.5 text-right" title={T.yorumPct}>Yorum %</th>
              {!isAll && <th className="px-3 py-2.5 text-right" title={T.hiz}>Hız</th>}
              {!isAll && <th className="px-3 py-2.5 text-right" title={T.endeks}>Fiyat Endeksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.brand} className={`zebra-row border-b border-white/5 transition-colors ${b.is_roomart ? 'border-l-2 border-l-gold' : ''}`}>
                <td className="px-3 py-2 font-mono text-white/30">{i + 1}</td>
                <td className="px-3 py-2"><StoreLink brand={b.brand} url={b.store_url} isRoomart={b.is_roomart} /></td>
                {isAll && <td className="px-3 py-2 text-right font-mono text-white/50">{b.cats}/6</td>}
                <td className="px-3 py-2 text-right font-mono text-white/70">{b.product_count}</td>
                <td className="px-3 py-2 text-right font-mono text-white">{b.avg_price != null ? formatCurrency(b.avg_price) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{b.avg_rating != null ? <span className="text-gold-400">★ {b.avg_rating}</span> : '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-white/70">{b.total_reviews}</td>
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

// ── ÜRÜN GÖRÜNÜMÜ (her eşleşme seti ayrı çerçevede) ───────────────────────────
const GRID = 'grid grid-cols-[minmax(0,1fr)_104px_88px_64px_76px_84px_120px] items-center'

function ProductView({ matches, light }) {
  const [q, setQ] = useState('')
  const [img, setImg] = useState({ show: false, x: 0, top: 0, src: null, name: '' })
  const showImg = (e, src, name) => {
    if (!src) return
    const row = e.currentTarget.closest('.cmp-prow')
    const r = (row || e.currentTarget).getBoundingClientRect()
    // "Ürün/Rakip" kolonunun sağ kenarı: satır sağ − sabit kolonlar (536) − sağ padding (12)
    const x = row ? r.right - 548 : r.right
    setImg({ show: true, x, top: r.top, src, name })
  }
  const hideImg = () => setImg(s => ({ ...s, show: false }))
  const filtered = useMemo(() => {
    const query = q.trim()
    const op = query ? priceOp(query) : null
    return matches.filter(m => {
      if (op) return op(m.our_price)
      if (!query) return true
      const hay = [m.our_name, m.category, ...m.competitors.flatMap(c => [c.brand, c.name])]
      return hay.some(h => cellMatch(h, query)) || cellMatch(formatCurrency(m.our_price), query)
    })
  }, [matches, q])

  return (
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

      {/* başlık + kayan liste TEK scroll kutusunda → scrollbar ikisini de eşit kaydırır (hizalı) */}
      <div className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: 'calc(100vh - 380px)' }}>
        {/* sabit başlık (sticky) — kartlarla aynı 1px yatay kenar (border-x) → kolonlar birebir hizalı */}
        <div className={`${GRID} sticky top-0 z-10 px-3 py-2 text-[11px] font-mono text-white/40 border-x border-transparent border-b border-white/10`} style={{ background: 'var(--bg-card)' }}>
          <span>Ürün / Rakip</span>
          <span className="text-right" title={T.fiyat}>Fiyat</span>
          <span className="text-right" title={T.delta}>Fiyat Farkı</span>
          <span className="text-right" title={T.puan}>Puan</span>
          <span className="text-right" title={T.yorum}>Yorum</span>
          <span className="text-right" title={T.sim}>Benzerlik</span>
          <span className="text-left pl-2">Kategori</span>
        </div>

        <div className="space-y-2 pt-2">
        {filtered.map(m => {
          const cfgRaw = QUADRANT_META[m.bcg_class] || { color: '#6B7280' }
          const cfg = { ...cfgRaw, color: tone(cfgRaw.color, light) }
          return (
            <div key={m.our_id} className="rounded-lg border border-white/10 overflow-hidden">
              {/* bizim ürün */}
              <div className={`cmp-prow ${GRID} px-3 py-2 hover:bg-white/[0.03] transition-colors`} style={{ background: 'var(--gold)0d' }}>
                <a href={m.our_url} target="_blank" rel="noreferrer" title={m.our_name}
                  className="font-medium text-white hover:text-gold inline-flex items-center gap-1 min-w-0"
                  onMouseEnter={e => showImg(e, m.our_image, m.our_name)} onMouseLeave={hideImg}>
                  <span className="truncate">★ {m.our_name}</span><ExternalLink size={10} className="text-white/25 flex-shrink-0" />
                </a>
                <span className="text-right font-mono text-white">{m.our_price != null ? formatCurrency(m.our_price) : '—'}</span>
                <span className="text-right font-mono text-white/30">—</span>
                <span className="text-right font-mono text-gold-400">{m.our_rating > 0 ? `★ ${m.our_rating}` : '—'}</span>
                <span className="text-right font-mono text-white/70">{m.our_reviews}</span>
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
                  <a href={c.url} target="_blank" rel="noreferrer" title={c.name}
                    className="inline-flex items-center gap-1.5 hover:text-gold min-w-0 pl-3"
                    onMouseEnter={e => showImg(e, c.image, c.name)} onMouseLeave={hideImg}>
                    <span className="text-white/40 font-mono flex-shrink-0">{c.brand}</span>
                    <span className="truncate">{c.name}</span>
                    <ExternalLink size={9} className="flex-shrink-0 text-white/20" />
                  </a>
                  <span className="text-right font-mono text-white/80">{c.price != null ? formatCurrency(c.price) : '—'}</span>
                  <span className="text-right font-mono">
                    {c.price_delta_pct == null ? '—' : <span className={c.price_delta_pct < 0 ? 'text-rose-400' : c.price_delta_pct > 0 ? 'text-emerald-400' : 'text-white/40'}>{c.price_delta_pct > 0 ? '+' : ''}%{c.price_delta_pct}</span>}
                  </span>
                  <span className="text-right font-mono text-white/60">{c.rating > 0 ? `${c.rating}★` : '—'}</span>
                  <span className="text-right font-mono text-white/50">{c.reviews}</span>
                  <span className="text-right font-mono text-white/40" title={T.sim}>{Math.round(c.score * 100)}%</span>
                  <span className="text-left pl-2"></span>
                </div>
              ))}
            </div>
          )
        })}
        </div>
      </div>

      {/* Hover ürün görseli — portal (backdrop-filter kırpmasına karşı), satırın sağında */}
      {img.show && img.src && typeof document !== 'undefined' && createPortal((() => {
        const W = 230, H = 250
        const vw = window.innerWidth, vh = window.innerHeight
        const left = img.x + 12 + W > vw ? Math.max(8, img.x - W - 12) : img.x + 12
        const top = Math.min(Math.max(8, img.top - 20), vh - H - 8)
        return (
          <div className="fixed z-[100] pointer-events-none rounded-lg border border-white/15 p-2 shadow-2xl backdrop-blur-xl"
            style={{ background: 'var(--bg-secondary)', left, top, width: W }}>
            <img src={img.src} alt="" className="w-full h-[190px] object-contain rounded bg-white/5" loading="lazy" />
            <div className="text-[10px] font-mono text-white/60 mt-1.5 line-clamp-2">{img.name}</div>
          </div>
        )
      })(), document.body)}
    </div>
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
            <Swords size={18} className="text-gold-400" /> Rekabet
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
