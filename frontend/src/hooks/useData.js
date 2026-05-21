import { useState, useEffect, useCallback } from 'react'

const BASE_URL = import.meta.env.BASE_URL || '/'

async function fetchJSON(path) {
  const url = (BASE_URL + path).replace(/\/\//g, '/')
  const response = await fetch(url + '?t=' + Date.now())
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`)
  return response.json()
}

export function useData(refreshInterval = 6 * 60 * 60 * 1000) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [bcgScores, trends, alertsData] = await Promise.all([
        fetchJSON('data/bcg_scores.json'),
        fetchJSON('data/trends.json'),
        fetchJSON('data/alerts.json'),
      ])
      setData({
        kpis: bcgScores.kpis,
        categories: bcgScores.categories,
        quadrantDistribution: bcgScores.quadrant_distribution,
        trends: trends.trends,
        alerts: alertsData.alerts,
        generatedAt: bcgScores.generated_at,
      })
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

  return { data, loading, error, lastUpdated, refetch: loadData }
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
