import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

const BASE_URL = import.meta.env.BASE_URL || '/'

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
  return {
    kpis: d.kpis,
    categories: normalizeCategories(d.categories ?? d.category_summary),
    quadrantDistribution: d.quadrant_distribution,
    trends: d.trends,
    alerts: d.alerts,
    generatedAt: d.generated_at,
  }
}

async function loadFromJSON() {
  const [bcgScores, trends, alertsData] = await Promise.all([
    fetchJSON('data/bcg_scores.json'),
    fetchJSON('data/trends.json'),
    fetchJSON('data/alerts.json'),
  ])
  return {
    kpis: bcgScores.kpis,
    categories: normalizeCategories(
      bcgScores.categories ?? bcgScores.category_summary
    ),
    quadrantDistribution: bcgScores.quadrant_distribution,
    trends: trends.trends,
    alerts: alertsData.alerts,
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
