import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'

const BASE_URL = import.meta.env.BASE_URL || '/'

async function fetchJSON(path) {
  const url = (BASE_URL + path).replace(/\/\//g, '/')
  const response = await fetch(url + '?t=' + Date.now())
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`)
  return response.json()
}

async function loadFromFirestore() {
  const q = query(
    collection(db, 'roomart-bcg-dev'),
    orderBy('generated_at', 'desc'),
    limit(1)
  )
  const snapshot = await getDocs(q)
  if (snapshot.empty) throw new Error('Firestore: koleksiyon boş')
  const doc = snapshot.docs[0].data()
  return {
    kpis: doc.kpis,
    categories: doc.categories,
    quadrantDistribution: doc.quadrant_distribution,
    trends: doc.trends,
    alerts: doc.alerts,
    generatedAt: doc.generated_at,
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
