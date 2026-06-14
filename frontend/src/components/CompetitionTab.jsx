import { useState, useMemo } from 'react'
import { Swords, Search, ExternalLink, X } from 'lucide-react'
import { QUADRANT_META, formatCurrency, tone } from '../utils/helpers'
import { useIsLight } from '../hooks/useTheme'

// Rakip metriği YORUM tabanlı (gerçek satış değil) — BCG'den AYRI.
const BCG_SHORT = { STAR: 'STAR', CASH_COW: 'CC', QUESTION_MARK: 'QM', DOG: 'DOG' }

// ── Akıllı arama yardımcıları (ProductTable ile aynı: binlik-ayraç duyarsız + fiyat operatörleri)
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

const SIM_TOOLTIP = 'Benzerlik skoru = 0.6 × ad-token örtüşmesi (Jaccard) + 0.4 × fiyat yakınlığı. Yüksek = ürünler daha benzer.'

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

// ── KATEGORİ GÖRÜNÜMÜ ─────────────────────────────────────────────────────────
function CategoryView({ categories }) {
  const [sel, setSel] = useState(categories[0]?.category)
  const cat = categories.find(c => c.category === sel) || categories[0]
  if (!cat) return null
  return (
    <div className="flex flex-col min-h-0">
      <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
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
        <span>Yorum lideri: <b className="text-white/80">{cat.leader}</b></span>
        {cat.roomart_rank && <span>· RoomArt sıra: <b className="text-gold">{cat.roomart_rank}/{cat.brands.length}</b></span>}
        <span className="text-white/30">· tüm marka sıralaması (yorum hacmine göre)</span>
      </div>

      <div className="overflow-y-auto overflow-x-hidden rounded-lg border border-white/5" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-white/10 text-[11px] font-mono text-white/40 text-left" style={{ background: 'var(--bg-card)' }}>
              <th className="px-3 py-2.5 w-8" title="Yorum hacmine göre sıra">#</th>
              <th className="px-3 py-2.5" title="Mağaza — tıkla, Trendyol mağazasına git">Marka</th>
              <th className="px-3 py-2.5 text-right" title="Bu kategorideki ürün sayısı (taranan)">Ürün</th>
              <th className="px-3 py-2.5 text-right" title="Markanın bu kategorideki ortalama satış fiyatı">Ort. Fiyat</th>
              <th className="px-3 py-2.5 text-right" title="Ortalama müşteri puanı (0-5)">Ort. Puan</th>
              <th className="px-3 py-2.5 text-right" title="Toplam değerlendirme (yorum) sayısı — talep/görünürlük vekili">Yorum</th>
              <th className="px-3 py-2.5 text-right" title="Kategorideki tüm yorumların yüzdesi (pazar görünürlüğü payı)">Yorum %</th>
              <th className="px-3 py-2.5 text-right" title="Bu haftaki yorum artışı (talep ivmesi). Veri biriktikçe dolar.">Hız</th>
              <th className="px-3 py-2.5 text-right" title="Marka ort. fiyatı ÷ kategori ort. fiyatı. >1 pahalı, <1 ucuz.">Fiyat Endeksi</th>
            </tr>
          </thead>
          <tbody>
            {cat.brands.map((b, i) => (
              <tr key={b.brand} className="zebra-row border-b border-white/5 transition-colors"
                style={b.is_roomart ? { background: 'var(--gold)12' } : undefined}>
                <td className="px-3 py-2 font-mono text-white/30">{i + 1}</td>
                <td className="px-3 py-2"><StoreLink brand={b.brand} url={b.store_url} isRoomart={b.is_roomart} /></td>
                <td className="px-3 py-2 text-right font-mono text-white/70">{b.product_count}</td>
                <td className="px-3 py-2 text-right font-mono text-white">{b.avg_price != null ? formatCurrency(b.avg_price) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{b.avg_rating != null ? <span className="text-gold-400">★ {b.avg_rating}</span> : '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-white/70">{b.total_reviews}</td>
                <td className="px-3 py-2 text-right font-mono text-white/60">%{b.review_share}</td>
                <td className="px-3 py-2 text-right font-mono">{b.review_velocity > 0 ? <span className="text-cyan-300">+{b.review_velocity}</span> : <span className="text-white/25">—</span>}</td>
                <td className="px-3 py-2 text-right font-mono">{b.price_index != null ? <span className={b.price_index > 1 ? 'text-rose-300' : 'text-emerald-300'}>{b.price_index}×</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── ÜRÜN GÖRÜNÜMÜ ─────────────────────────────────────────────────────────────
function ProductView({ matches, light }) {
  const [q, setQ] = useState('')
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

      <div className="overflow-y-auto overflow-x-hidden rounded-lg border border-white/5" style={{ maxHeight: 'calc(100vh - 380px)' }}>
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: '40%' }} />{/* Ürün / Rakip */}
            <col style={{ width: '11%' }} />{/* Fiyat */}
            <col style={{ width: '9%' }} />{/* Fiyat Farkı */}
            <col style={{ width: '8%' }} />{/* Puan */}
            <col style={{ width: '9%' }} />{/* Yorum */}
            <col style={{ width: '10%' }} />{/* Benzerlik */}
            <col style={{ width: '13%' }} />{/* Kategori/BCG */}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-white/10 text-[11px] font-mono text-white/40 text-left" style={{ background: 'var(--bg-card)' }}>
              <th className="px-3 py-2.5">Ürün / Rakip</th>
              <th className="px-3 py-2.5 text-right">Fiyat</th>
              <th className="px-3 py-2.5 text-right" title="Rakip fiyatı − bizim fiyat. Kırmızı = rakip daha ucuz (altımızda).">Fiyat Farkı</th>
              <th className="px-3 py-2.5 text-right">Puan</th>
              <th className="px-3 py-2.5 text-right">Yorum</th>
              <th className="px-3 py-2.5 text-right" title={SIM_TOOLTIP}>Benzerlik</th>
              <th className="px-3 py-2.5 text-left">Kategori</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const cfgRaw = QUADRANT_META[m.bcg_class] || { color: '#6B7280', label: '—' }
              const cfg = { ...cfgRaw, color: tone(cfgRaw.color, light) }
              return [
                /* bizim ürün — grup başlığı satırı */
                <tr key={m.our_id} className="zebra-row border-t border-white/10 transition-colors" style={{ background: 'var(--gold)0c' }}>
                  <td className="px-3 py-2">
                    <a href={m.our_url} target="_blank" rel="noreferrer" title={m.our_name}
                      className="font-medium text-white hover:text-gold inline-flex items-center gap-1 line-clamp-1">
                      ★ {m.our_name}<ExternalLink size={10} className="text-white/25 flex-shrink-0" />
                    </a>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-white">{m.our_price != null ? formatCurrency(m.our_price) : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-white/30">—</td>
                  <td className="px-3 py-2 text-right font-mono text-gold-400">{m.our_rating > 0 ? `★ ${m.our_rating}` : '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-white/70">{m.our_reviews}</td>
                  <td className="px-3 py-2 text-right font-mono text-white/30">—</td>
                  <td className="px-3 py-2 text-left">
                    <span className="text-[10px] font-mono text-white/40">{m.category}</span>
                    {m.bcg_class && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono" style={{ background: `${cfg.color}15`, color: cfg.color }}>{BCG_SHORT[m.bcg_class]}</span>}
                  </td>
                </tr>,
                /* rakip eşleşmeler */
                ...m.competitors.map((c, i) => (
                  <tr key={m.our_id + '-' + i} className="zebra-row border-b border-white/5 transition-colors text-white/70">
                    <td className="px-3 py-1.5 pl-6">
                      <a href={c.url} target="_blank" rel="noreferrer" title={c.name}
                        className="inline-flex items-center gap-1.5 hover:text-gold line-clamp-1">
                        <span className="text-white/40 font-mono flex-shrink-0">{c.brand}</span>
                        <span className="truncate">{c.name}</span>
                        <ExternalLink size={9} className="flex-shrink-0 text-white/20" />
                      </a>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-white/80">{c.price != null ? formatCurrency(c.price) : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {c.price_delta_pct == null ? '—' : <span className={c.price_delta_pct < 0 ? 'text-rose-400' : c.price_delta_pct > 0 ? 'text-emerald-400' : 'text-white/40'}>{c.price_delta_pct > 0 ? '+' : ''}%{c.price_delta_pct}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-white/60">{c.rating > 0 ? `${c.rating}★` : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-white/50">{c.reviews}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-white/40" title={SIM_TOOLTIP}>{Math.round(c.score * 100)}%</td>
                    <td className="px-3 py-1.5"></td>
                  </tr>
                )),
              ]
            })}
          </tbody>
        </table>
      </div>
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
        <p className="text-white/30 font-mono text-xs mt-1">Haftalık rakip taraması (competitor.yml) çalıştıktan sonra burada görünecek.</p>
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
