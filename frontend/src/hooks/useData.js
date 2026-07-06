import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

const BASE_URL = import.meta.env.BASE_URL || '/'

// trends_sonuc.json → TrendCharts の beklediği format
function transformTrendsSonuc(sonuc) {
  if (!sonuc?.kategoriler) return []
  return Object.entries(sonuc.kategoriler).map(([keyword, data]) => ({
    slug: keyword.replace(/\s+/g, '-').replace(/[üÜ]/g, 'u').replace(/[çÇ]/g, 'c').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i').replace(/[öÖ]/g, 'o'),
    category: keyword.charAt(0).toUpperCase() + keyword.slice(1),
    growth_rate: data.buyume_yuzde ?? 0,
    trend_score: data.ortalama ?? 50,
    peak_interest: data.maks ?? 0,
    trend_label: data.trend || '',
    data_points: (data.haftalik || []).map((value, i) => ({ week: i, value: value ?? 0 })),
    synthetic: false,
  }))
}

async function fetchJSON(path) {
  const url = (BASE_URL + path).replace(/\/\//g, '/')
  const response = await fetch(url + '?t=' + Date.now())
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`)
  return response.json()
}

// Quadrant hesabı: share/growth ortalamasına göre
function assignQuadrant(shareScore, growthScore) {
  const highShare = shareScore >= 50
  const highGrowth = growthScore >= 50
  if (highShare && highGrowth) return 'STAR'
  if (highShare && !highGrowth) return 'CASH_COW'
  if (!highShare && highGrowth) return 'QUESTION_MARK'
  return 'DOG'
}

// JSON category_summary → BCGMatrix'in beklediği formata dönüştür
function normalizeCategories(raw) {
  if (!raw) return []
  return raw.map((c, i) => {
    const share = c.avg_share_score ?? c.share_score ?? 50
    const growth = c.avg_growth_score ?? c.growth_score ?? 50
    const quadrant = c.quadrant ?? assignQuadrant(share, growth)
    return {
      id: c.id ?? `cat-${i}`,
      category: c.category ?? c.name ?? `Kategori ${i + 1}`,
      slug: (c.category ?? c.name ?? '').toLowerCase().replace(/\s+/g, '-'),
      share_score: share,
      growth_score: growth,
      product_count: c.product_count ?? c.products?.length ?? 0,
      total_reviews: c.total_reviews ?? 0,
      total_revenue: c.total_revenue ?? 0,
      // CategoryPanel detayının kullandığı alanlar (payload üretiyor; eşlenmezse NaN/undefined)
      avg_price: c.avg_price ?? 0,
      avg_rating: c.avg_rating ?? 0,
      trend_score: c.trend_score ?? 50,
      trend_growth: c.trend_growth ?? 0,
      confidence: c.confidence,
      health: c.health ?? 'MIXED',
      bcg: { quadrant },
      recommendation: c.recommendation ?? {
        action: quadrant === 'STAR' ? 'INVEST'
               : quadrant === 'CASH_COW' ? 'HARVEST'
               : quadrant === 'QUESTION_MARK' ? 'INVEST'
               : 'DIVEST',
        priority: quadrant === 'DOG' ? 'LOW' : 'HIGH',
      },
    }
  })
}

// Çok-platform registry'yi ürünlere STOK KODU (kod) ile bağla.
// Her ürüne platform fiyatları + platform yorumları eklenir (Trendyol tablosu zenginleşir).
function joinRegistry(products, registry) {
  if (!registry?.products || !Array.isArray(products)) return products
  const bySc = registry.products
  return products.map(p => {
    const entry = bySc[String(p.kod || '').trim()]
    if (!entry) return p
    return {
      ...p,
      platforms: entry.platforms || {},        // {trendyol,shopify,n11,hb: {price,...}}
      platform_reviews: entry.reviews || {},   // {n11,shopify: {rating,review_count}}
      total_reviews_all: entry.total_reviews ?? null,
      price_spread_pct: entry.price_spread_pct ?? null,
      price_conflict: entry.price_conflict ?? false,
    }
  })
}

async function loadFromFirestore() {
  const docRef = doc(db, 'roomart-bcg-dev', 'latest')
  const snapshot = await Promise.race([
    getDoc(docRef),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore timeout (8s)')), 8000)
    ),
  ])
  if (!snapshot.exists()) throw new Error('Firestore: koleksiyon boş')
  const d = snapshot.data()
  // Rekabet verisi AYRI dokümanda (competitive_latest); yoksa sekme boş-durum gösterir.
  let competitive = null
  try {
    const cs = await getDoc(doc(db, 'roomart-bcg-dev', 'competitive_latest'))
    if (cs.exists()) competitive = cs.data()
  } catch { /* yoksa null */ }
  // CLEAR karar katmanı AYRI dokümanda (clear_latest) — hassas marj içerdiği için
  // yalnız Firestore'da (public JSON yok). Yoksa Karar sekmesi boş-durum gösterir.
  let clear = null
  try {
    const cl = await getDoc(doc(db, 'roomart-bcg-dev', 'clear_latest'))
    if (cl.exists()) clear = cl.data()
  } catch { /* yoksa null */ }
  if (!clear) {
    clear = await fetchJSON('data/clear_scores.json').catch(() => null)
  }
  // Çok-platform registry (registry_latest) — hassas ciro içerir, yalnız Firestore + yerel JSON.
  let registry = null
  try {
    const rg = await getDoc(doc(db, 'roomart-bcg-dev', 'registry_latest'))
    if (rg.exists()) registry = rg.data()
  } catch { /* yoksa null */ }
  if (!registry) {
    registry = await fetchJSON('data/product_registry.json').catch(() => null)
  }
  return {
    kpis: d.kpis,
    categories: normalizeCategories(d.categories ?? d.category_summary),
    products: joinRegistry(d.products ?? [], registry),
    quadrantDistribution: d.quadrant_distribution,
    trends: d.trends,
    alerts: d.alerts,
    competitive,
    clear,
    registry,
    generatedAt: d.generated_at,
  }
}

async function loadFromJSON() {
  const [bcgScores, trendsSonuc, alertsData, competitive, clear, registry] = await Promise.all([
    fetchJSON('data/bcg_scores.json'),
    fetchJSON('data/trends_sonuc.json').catch(() => null),
    fetchJSON('data/alerts.json'),
    fetchJSON('data/competitive.json').catch(() => null),
    fetchJSON('data/clear_scores.json').catch(() => null),       // yerel dev; public'te yok (gitignored)
    fetchJSON('data/product_registry.json').catch(() => null),   // yerel dev; public'te yok (gitignored)
  ])
  return {
    kpis: bcgScores.kpis,
    categories: normalizeCategories(
      bcgScores.categories ?? bcgScores.category_summary
    ),
    products: joinRegistry(bcgScores.products ?? [], registry),
    quadrantDistribution: bcgScores.quadrant_distribution,
    trends: transformTrendsSonuc(trendsSonuc),
    alerts: alertsData.alerts,
    competitive,
    clear,
    registry,
    generatedAt: bcgScores.generated_at,
  }
}

export function useData(refreshInterval = 6 * 60 * 60 * 1000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [source, setSource] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      let result
      try {
        result = await loadFromFirestore()
        setSource('firestore')
      } catch (fsErr) {
        console.warn('Firestore yüklenemedi, JSON fallback:', fsErr.message)
        result = await loadFromJSON()
        setSource('json')
      }
      // Firestore path'ta trends gelmemişse JSON'dan yükle
      if (!result.trends?.length) {
        try {
          const ts = await fetchJSON('data/trends_sonuc.json')
          result = { ...result, trends: transformTrendsSonuc(ts) }
        } catch { /* veri yoksa Trends sekmesi boş-durum gösterir */ }
      }
      setData(result)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, refreshInterval)
    return () => clearInterval(interval)
  }, [loadData, refreshInterval])

  return { data, loading, error, lastUpdated, refetch: loadData, source }
}

export function useKioskMode() {
  const [isKiosk, setIsKiosk] = useState(false)
  const toggleKiosk = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsKiosk(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsKiosk(false)).catch(() => {})
    }
  }, [])
  useEffect(() => {
    const handler = () => setIsKiosk(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])
  return { isKiosk, toggleKiosk }
}
