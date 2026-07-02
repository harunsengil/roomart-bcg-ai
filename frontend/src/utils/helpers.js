export function formatNumber(n) {
  if (n === undefined || n === null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('tr-TR')
}

export function formatCurrency(n) {
  if (n === undefined || n === null) return '—'
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
}

export function formatScore(n) {
  if (n === undefined || n === null) return '—'
  return Math.round(n).toString()
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Light mode: parlak amber/gold beyaz üstünde okunmuyor → yalnız bu tonları koyulaştır.
// Diğer renkler (yeşil/mavi/kırmızı/gri) light'ta zaten okunur → dokunma.
const LIGHT_REMAP = {
  '#F59E0B': '#b45309', '#f59e0b': '#b45309',
  '#d4a017': '#8a5a00', '#f0c040': '#8a5a00', '#f5d060': '#8a5a00', '#b8860b': '#8a5a00',
}
export const tone = (hex, light) => (light && LIGHT_REMAP[hex]) || hex

export const QUADRANT_META = {
  STAR: { label: 'STAR', emoji: '⭐', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', textClass: 'text-amber-400' },
  CASH_COW: { label: 'CASH COW', emoji: '🐄', color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', textClass: 'text-emerald-400' },
  QUESTION_MARK: { label: 'QUESTION MARK', emoji: '❓', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', textClass: 'text-blue-400' },
  DOG: { label: 'DOG', emoji: '🐕', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', textClass: 'text-red-400' },
}

export const ACTION_META = {
  INVEST: { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  SCALE: { color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  HARVEST: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  TEST: { color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  OPTIMIZE: { color: '#6B7280', bg: 'rgba(107,114,128,0.15)' },
  EXIT: { color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
}

// CLEAR karar katmanı aksiyonları (backend clear_engine.py ile birebir eşleşir).
export const CLEAR_ACTION_META = {
  scale:         { label: 'Ölçekle',            color: '#10B981', bg: 'rgba(16,185,129,0.15)', icon: '📈' },
  protect:       { label: 'Koru ve Güçlendir',  color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', icon: '🛡️' },
  test:          { label: 'Kontrollü Test Et',  color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', icon: '🧪' },
  fix_margin:    { label: 'Marjı Onar',         color: '#EF4444', bg: 'rgba(239,68,68,0.15)',  icon: '💰' },
  fix_operation: { label: 'Önce Operasyonu Onar', color: '#F97316', bg: 'rgba(249,115,22,0.15)', icon: '📦' },
  reduce_stock:  { label: 'Stoku Azalt',        color: '#EAB308', bg: 'rgba(234,179,8,0.15)',  icon: '📉' },
  prepare_exit:  { label: 'Çıkışa Hazırla',     color: '#DC2626', bg: 'rgba(220,38,38,0.15)',  icon: '🚪' },
  complete_data: { label: 'Veriyi Tamamla',     color: '#6B7280', bg: 'rgba(107,114,128,0.15)', icon: '📋' },
  monitor:       { label: 'İzle ve Derinleştir', color: '#64748B', bg: 'rgba(100,116,139,0.15)', icon: '👁️' },
}

// CLEAR 5 boyut meta (sıra + Türkçe etiket + kısa açıklama)
export const CLEAR_DIMENSIONS = [
  { key: 'demand_score',      label: 'Talep İvmesi',         short: 'Talep',     desc: 'Ürünün/kategorinin büyüme ve talep sinyali (BCG büyüme ekseni).' },
  { key: 'competition_score', label: 'Rekabet Gücü',         short: 'Rekabet',   desc: 'Rakip karşısındaki pazar pozisyonu (BCG pazar payı ekseni; rakip analizi gelince güçlenir).' },
  { key: 'profit_score',      label: 'Kâr Kalitesi',         short: 'Kâr',       desc: 'Katkı marjı kalitesi. Manuel maliyet verisi (CSV) ister; yoksa boş.' },
  { key: 'operation_score',   label: 'Operasyonel Uygunluk', short: 'Operasyon', desc: 'Stok, tedarik, iade, hasar sürekliliği. Manuel operasyon verisi (CSV) ister; yoksa boş.' },
  { key: 'confidence_score',  label: 'Veri Güveni',          short: 'Güven',     desc: 'Kararın hangi güven seviyesiyle üretildiği. Eksik kritik veri güveni düşürür.' },
]

// Skor rengi: 0-100 → kırmızı/amber/yeşil (null = gri "veri yok")
export const scoreColor = (s) => {
  if (s === null || s === undefined) return '#6B7280'
  if (s >= 65) return '#10B981'
  if (s >= 45) return '#F59E0B'
  return '#EF4444'
}
