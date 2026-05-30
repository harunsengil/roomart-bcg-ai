import { useState, useEffect, useMemo } from 'react'
import { formatCurrency } from '../utils/helpers'

// analyzer.py EXCLUDE_TOKEN ile birebir aynı olmalı
const EXCLUDE_TOKEN = '__EXCLUDE__'
const BASE_URL = import.meta.env.BASE_URL || '/'

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

  useEffect(() => { loadCategoryMap().then(setBaseMap) }, [])

  // 5 gerçek kategori adı (payload'dan; analyzer CATEGORIES ile aynı)
  const categoryNames = useMemo(
    () => (categories || []).map(c => c.category).filter(Boolean),
    [categories]
  )

  // Atanacaklar = is_unassigned (DİĞER) ürünler
  const unassigned = useMemo(
    () => (products || []).filter(p => p.is_unassigned),
    [products]
  )

  const setChoice = (pid, value) =>
    setAssignments(prev => ({ ...prev, [pid]: value }))

  // İndirilecek/kopyalanacak tam harita = mevcut + yeni seçimler (boşlar atlanır)
  const mergedMap = useMemo(() => {
    const picked = Object.fromEntries(
      Object.entries(assignments).filter(([, v]) => v)
    )
    return { ...(baseMap || {}), ...picked }
  }, [baseMap, assignments])

  const pickedCount = Object.values(assignments).filter(Boolean).length
  const assignedCount = Object.values(assignments).filter(v => v && v !== EXCLUDE_TOKEN).length
  const excludedCount = Object.values(assignments).filter(v => v === EXCLUDE_TOKEN).length
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

  return (
    <div className="card p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-white font-semibold">Kategori Atama (DİĞER)</h2>
          <p className="text-xs text-white/40 font-mono mt-0.5">
            {unassigned.length} atanmamış ürün · {assignedCount} atandı · {excludedCount} hariç tutuldu
          </p>
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

      {/* Kullanım notu */}
      <div className="text-[11px] font-mono text-white/40 bg-white/4 border border-white/5 rounded-lg p-3 leading-relaxed">
        Her ürüne kategori seç ya da <b className="text-white/60">Hariç Tut</b> (mobilya dışı/gürültü) işaretle.
        Sonra <b className="text-white/60">İndir</b> → repoda <code className="text-gold/80">data/category_map.json</code> olarak
        kaydet & commit et. <code className="text-gold/80">analyze.yml</code> tetiklenir, bir sonraki çalıştırmada
        atananlar kategorilere girer, hariç tutulanlar analizden tamamen çıkar.
      </div>

      {unassigned.length === 0 ? (
        <div className="text-sm font-mono text-white/40 py-8 text-center">
          🎉 Atanmamış (DİĞER) ürün yok — hepsi kategorilenmiş ya da hariç tutulmuş.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Ürün</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Fiyat</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Atama</th>
                <th className="px-4 py-3 text-left text-xs font-mono text-white/40">Link</th>
              </tr>
            </thead>
            <tbody>
              {unassigned.map(p => {
                const val = assignments[p.id] || ''
                const done = !!val
                return (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white text-sm truncate max-w-md">{p.name}</div>
                      <div className="text-[10px] text-white/30 font-mono">id: {p.id}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-white whitespace-nowrap">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={val}
                        onChange={e => setChoice(p.id, e.target.value)}
                        className="bg-navy-900 border rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-gold/40 min-w-[15rem]"
                        style={{ borderColor: done ? (val === EXCLUDE_TOKEN ? '#6B728060' : '#10B98160') : 'rgba(255,255,255,0.1)' }}
                      >
                        <option value="">— seç —</option>
                        {categoryNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                        <option value={EXCLUDE_TOKEN}>⊘ Hariç Tut (mobilya dışı)</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <a href={p.url} target="_blank" rel="noreferrer"
                        className="text-xs font-mono text-blue-400/70 hover:text-blue-400">aç ↗</a>
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
