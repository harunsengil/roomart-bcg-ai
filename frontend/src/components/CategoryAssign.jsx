import { useState, useEffect, useMemo } from 'react'
import { Search, X, ExternalLink } from 'lucide-react'
import { formatCurrency } from '../utils/helpers'

// analyzer.py EXCLUDE_TOKEN ile birebir aynı olmalı
const EXCLUDE_TOKEN = '__EXCLUDE__'
// Yerel sentinel: bir override'ı kaldır → ürün categorize()'a (otomatik) geri döner.
// Haritaya YAZILMAZ; sadece mergedMap kurulurken ilgili anahtarı siler.
const AUTO_TOKEN = '__AUTO__'
const BASE_URL = import.meta.env.BASE_URL || '/'

const norm = (s) =>
  (s || '').replace('İ', 'i').replace('I', 'i').replace('ı', 'i').toLowerCase().replace(/\s+/g, ' ').trim()

// Mevcut data/category_map.json'u (statik) yükle; yoksa boş {} ile başla
async function loadCategoryMap() {
  try {
    const url = (BASE_URL + 'data/category_map.json').replace(/\/\//g, '/')
    const res = await fetch(url + '?t=' + Date.now())
    if (!res.ok) return {}
    const j = await res.json()
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}

export default function CategoryAssign({ products, categories }) {
  const [baseMap, setBaseMap] = useState(null)        // repodaki mevcut category_map.json
  const [assignments, setAssignments] = useState({})  // bu oturumda yapılan seçimler {pid: değer}
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)       // false: yalnız DİĞER, true: tüm ürünler

  useEffect(() => { loadCategoryMap().then(setBaseMap) }, [])

  // 5 gerçek kategori adı (payload'dan; analyzer CATEGORIES ile aynı)
  const categoryNames = useMemo(
    () => (categories || []).map(c => c.category).filter(Boolean),
    [categories]
  )

  const all = products || []
  const unassigned = useMemo(() => all.filter(p => p.is_unassigned), [all])

  // Görüntülenecek liste: arama varsa TÜM ürünlerde ara (atanmışları da getir);
  // arama yoksa anahtar'a göre (yalnız atanmamış / tümü).
  const list = useMemo(() => {
    const q = norm(search)
    const base = (q || showAll) ? all : unassigned
    if (!q) return base
    return base.filter(p => norm(p.name).includes(q) || String(p.id).includes(q))
  }, [all, unassigned, search, showAll])

  const setChoice = (pid, value) =>
    setAssignments(prev => ({ ...prev, [pid]: value }))

  // Tam harita = mevcut + seçimler; AUTO_TOKEN → anahtarı sil (otomatiğe döndür)
  const mergedMap = useMemo(() => {
    const m = { ...(baseMap || {}) }
    for (const [pid, v] of Object.entries(assignments)) {
      if (v === AUTO_TOKEN) delete m[pid]
      else if (v) m[pid] = v
    }
    return m
  }, [baseMap, assignments])

  const picks = Object.entries(assignments).filter(([, v]) => v)
  const pickedCount = picks.length
  const assignedCount = picks.filter(([, v]) => v !== EXCLUDE_TOKEN && v !== AUTO_TOKEN).length
  const excludedCount = picks.filter(([, v]) => v === EXCLUDE_TOKEN).length
  const revertedCount = picks.filter(([, v]) => v === AUTO_TOKEN).length
  const jsonText = JSON.stringify(mergedMap, null, 2)

  const download = () => {
    const blob = new Blob([jsonText + '\n'], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'category_map.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard yoksa indir butonu var */ }
  }

  if (baseMap === null) {
    return <div className="card p-6 text-sm font-mono text-white/40">category_map.json yükleniyor…</div>
  }

  const catBadge = (cat) => {
    const other = cat === 'DİĞER' || !cat
    return (
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap"
        style={{ background: other ? '#6B728018' : '#d4a01718', color: other ? '#9CA3AF' : '#d4a017' }}>
        {cat || 'DİĞER'}
      </span>
    )
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-white font-semibold">Kategori Atama</h2>
          <p className="text-xs text-white/40 font-mono mt-0.5">
            {unassigned.length} atanmamış · {assignedCount} atandı · {excludedCount} hariç · {revertedCount} otomatiğe döndü
          </p>
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Ara: ürün adı veya id (tüm ürünlerde)…"
                className="pl-7 pr-7 py-1.5 text-xs font-mono bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-gold/40 w-72" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"><X size={13} /></button>}
            </div>
            <button onClick={() => setShowAll(s => !s)}
              className="px-2.5 py-1.5 text-xs font-mono rounded-lg border transition-all"
              style={{ borderColor: showAll ? '#d4a01760' : 'rgba(255,255,255,0.1)', color: showAll ? '#d4a017' : 'rgba(255,255,255,0.5)' }}>
              {showAll ? 'Tümü' : 'Sadece atanmamış'}
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={copy} disabled={!pickedCount}
              className="px-3 py-1.5 text-xs font-mono rounded-lg border border-white/10 text-white/70 hover:border-gold/40 hover:text-gold disabled:opacity-30 transition-all">
              {copied ? 'Kopyalandı ✓' : 'JSON Kopyala'}
            </button>
            <button onClick={download} disabled={!pickedCount}
              className="px-3 py-1.5 text-xs font-mono rounded-lg border border-gold/40 text-gold hover:bg-gold/10 disabled:opacity-30 transition-all">
              category_map.json İndir
            </button>
          </div>
        </div>
      </div>

      {/* Kullanım notu */}
      <div className="text-[11px] font-mono text-white/40 bg-white/4 border border-white/5 rounded-lg p-3 leading-relaxed">
        Her ürüne kategori seç, <b className="text-white/60">Hariç Tut</b> (mobilya dışı/gürültü) ya da
        <b className="text-white/60"> Otomatik'e döndür</b> (override'ı kaldır) işaretle. Ara kutusuyla
        <b className="text-white/60"> herhangi bir ürünü</b> (atanmış dahil) getirip kategorisini değiştirebilirsin.
        Sonra <b className="text-white/60">İndir</b> → <code className="text-gold/80">data/category_map.json</code> olarak
        commit et; <code className="text-gold/80">analyze.yml</code> tetiklenir.
        <span className="text-white/30"> (Tek-tık "Kategori Ata" persist'i yakında.)</span>
      </div>

      {list.length === 0 ? (
        <div className="text-sm font-mono text-white/40 py-8 text-center">
          {search ? 'Aramayla eşleşen ürün yok.' : '🎉 Atanmamış (DİĞER) ürün yok — hepsi kategorilenmiş ya da hariç tutulmuş.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Ürün</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Mevcut</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Fiyat</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Atama</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const val = assignments[p.id] || ''
                const hasOverride = !!(baseMap && baseMap[p.id])
                const borderColor = !val ? 'rgba(255,255,255,0.1)'
                  : val === EXCLUDE_TOKEN ? '#6B728060'
                  : val === AUTO_TOKEN ? '#3B82F660'
                  : '#10B98160'
                return (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 max-w-md">
                      <a href={p.url} target="_blank" rel="noreferrer"
                        className="font-medium text-white text-sm hover:text-gold inline-flex items-start gap-1 group">
                        {p.name}
                        <ExternalLink size={11} className="mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-60" />
                      </a>
                      <div className="text-[10px] text-white/30 font-mono">id: {p.id}</div>
                    </td>
                    <td className="px-4 py-3">{catBadge(p.category)}</td>
                    <td className="px-4 py-3 font-mono text-sm text-white whitespace-nowrap">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={val}
                        onChange={e => setChoice(p.id, e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-gold/40 min-w-[15rem]"
                        style={{ borderColor, background: 'var(--bg-secondary)' }}
                      >
                        <option value="">— seç —</option>
                        {categoryNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                        <option value={EXCLUDE_TOKEN}>⊘ Hariç Tut (mobilya dışı)</option>
                        {hasOverride && <option value={AUTO_TOKEN}>↩ Otomatik'e döndür</option>}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
