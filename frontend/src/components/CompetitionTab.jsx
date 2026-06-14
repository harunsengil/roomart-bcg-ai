import { useState, useMemo } from 'react'
import { Swords, Search, ExternalLink, TrendingUp, ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { QUADRANT_META, formatCurrency, tone } from '../utils/helpers'
import { useIsLight } from '../hooks/useTheme'

// Rakip metriği YORUM tabanlı (gerçek satış değil) — BCG'den AYRI. UI bunu açıkça etiketler.
const BCG_SHORT = { STAR: 'STAR', CASH_COW: 'CC', QUESTION_MARK: 'QM', DOG: 'DOG' }

function Delta({ pct, value, invert }) {
  // invert=true → düşük iyi (fiyat: rakip ucuzsa bizim için kötü). Burada delta = rakip - biz.
  if (value == null && pct == null) return <span className="text-white/30">—</span>
  const n = pct ?? value
  const up = n > 0
  const good = invert ? up : up      // sadece renk; yorum amaçlı
  const Icon = n === 0 ? Minus : up ? ArrowUp : ArrowDown
  const color = n === 0 ? 'text-white/40' : up ? 'text-emerald-400' : 'text-rose-400'
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono ${color}`}>
      <Icon size={11} />{pct != null ? `%${Math.abs(pct)}` : Math.abs(value).toFixed(value % 1 ? 1 : 0)}
    </span>
  )
}

function CategoryView({ categories, light }) {
  const [sel, setSel] = useState(categories[0]?.category)
  const cat = categories.find(c => c.category === sel) || categories[0]
  if (!cat) return null
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
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

      <div className="flex items-center gap-3 text-xs font-mono text-white/50">
        <span>Yorum lideri: <b className="text-white/80">{cat.leader}</b></span>
        {cat.roomart_rank && <span>· RoomArt sıra: <b className="text-gold">{cat.roomart_rank}/{cat.brands.length}</b></span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] font-mono text-white/40 text-left">
              <th className="px-3 py-2">Marka</th>
              <th className="px-3 py-2 text-right">Ürün</th>
              <th className="px-3 py-2 text-right">Ort. Fiyat</th>
              <th className="px-3 py-2 text-right">Ort. Puan</th>
              <th className="px-3 py-2 text-right">Yorum</th>
              <th className="px-3 py-2 text-right">Yorum %</th>
              <th className="px-3 py-2 text-right" title="Bu haftaki yorum artışı (talep ivmesi)">Hız</th>
              <th className="px-3 py-2 text-right" title="Marka ort. fiyatı / kategori ort.">Fiyat Endeksi</th>
            </tr>
          </thead>
          <tbody>
            {cat.brands.map(b => (
              <tr key={b.brand}
                className="border-b border-white/5 transition-colors"
                style={b.is_roomart ? { background: 'var(--gold)12' } : undefined}>
                <td className="px-3 py-2 font-medium" style={{ color: b.is_roomart ? 'var(--gold)' : 'var(--text-primary)' }}>
                  {b.is_roomart ? '★ ROOMART' : b.brand}
                </td>
                <td className="px-3 py-2 text-right font-mono text-white/70">{b.product_count}</td>
                <td className="px-3 py-2 text-right font-mono text-white">{b.avg_price != null ? formatCurrency(b.avg_price) : '—'}</td>
                <td className="px-3 py-2 text-right font-mono">{b.avg_rating != null ? <span className="text-gold-400">★ {b.avg_rating}</span> : '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-white/70">{b.total_reviews}</td>
                <td className="px-3 py-2 text-right font-mono text-white/60">%{b.review_share}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {b.review_velocity != null && b.review_velocity > 0
                    ? <span className="text-cyan-300">+{b.review_velocity}</span>
                    : <span className="text-white/25">—</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {b.price_index != null
                    ? <span className={b.price_index > 1 ? 'text-rose-300' : 'text-emerald-300'}>{b.price_index}×</span>
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProductView({ matches, light }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (s ? matches.filter(m => m.our_name.toLowerCase().includes(s) || m.category.toLowerCase().includes(s)) : matches)
      .slice(0, 60)
  }, [matches, q])
  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ürün / kategori ara…"
          className="pl-7 pr-3 py-1.5 text-xs font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-gold/40 w-full" />
      </div>
      <p className="text-[11px] font-mono text-white/30">{filtered.length} ürün gösteriliyor (en yakın 3 rakip · benzerlik skoruyla)</p>

      <div className="space-y-2">
        {filtered.map(m => {
          const cfgRaw = QUADRANT_META[m.bcg_class] || { color: '#6B7280', label: '—' }
          const cfg = { ...cfgRaw, color: tone(cfgRaw.color, light) }
          return (
            <div key={m.our_id} className="rounded-lg border border-white/5 p-3" style={{ background: 'var(--bg-card)' }}>
              {/* bizim ürün */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="text-sm text-white font-medium truncate">★ {m.our_name}</div>
                  <div className="text-[11px] font-mono text-white/40">{m.category}</div>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono flex-shrink-0">
                  <span className="text-white">{m.our_price != null ? formatCurrency(m.our_price) : '—'}</span>
                  <span className="text-gold-400">★ {m.our_rating}</span>
                  <span className="text-white/50">{m.our_reviews} yor.</span>
                  {m.bcg_class && <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: `${cfg.color}15`, color: cfg.color }}>{BCG_SHORT[m.bcg_class]}</span>}
                </div>
              </div>
              {/* rakip eşleşmeler */}
              <div className="space-y-1 pl-3 border-l-2 border-white/10">
                {m.competitors.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-xs">
                    <a href={c.url} target="_blank" rel="noreferrer" title={c.name}
                      className="min-w-0 flex items-center gap-1.5 text-white/70 hover:text-gold truncate">
                      <span className="text-white/40 font-mono flex-shrink-0">{c.brand}</span>
                      <span className="truncate">{c.name}</span>
                      <ExternalLink size={10} className="flex-shrink-0 text-white/25" />
                    </a>
                    <div className="flex items-center gap-3 font-mono flex-shrink-0">
                      <span className="text-white/70 w-16 text-right">{c.price != null ? formatCurrency(c.price) : '—'}</span>
                      <span className="w-12 text-right" title="fiyat farkı (rakip − biz)"><Delta pct={c.price_delta_pct} invert /></span>
                      <span className="text-white/50 w-10 text-right" title="puan farkı">{c.rating}★</span>
                      <span className="text-white/30 w-12 text-right" title="yorum">{c.reviews}y</span>
                      <span className="text-white/25 w-8 text-right" title="benzerlik skoru">{Math.round(c.score * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
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
    <div className="card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-white font-semibold flex items-center gap-2">
            <Swords size={18} className="text-gold-400" /> Rekabet
          </h2>
          <p className="text-[11px] text-white/40 font-mono mt-0.5">
            {md.competitor_products} rakip ürün · {md.latest_snapshot} · <span className="text-amber-300/70">yorum-tabanlı (BCG gerçek-satıştan ayrı)</span>
            {!md.has_velocity && ' · yorum-hızı için veri birikiyor'}
          </p>
        </div>
        <div className="flex gap-1">
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
        ? <CategoryView categories={data.categories} light={light} />
        : <ProductView matches={data.matches || []} light={light} />}
    </div>
  )
}
