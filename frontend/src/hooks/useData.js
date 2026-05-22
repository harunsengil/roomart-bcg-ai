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

async function loadFromFirestore() {
  // Direkt 'latest' dokümanını oku — orderBy/timestamp sorunu yok
  const docRef = doc(db, 'roomart-bcg-dev', 'latest')
  // 8 saniyelik timeout — takılı kalmayı önler
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
    categories: d.categories,
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
    categories: bcgScores.categories,
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
