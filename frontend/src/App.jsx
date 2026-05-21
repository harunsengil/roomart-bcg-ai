import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, WifiOff, LayoutDashboard, TrendingUp, Bell, Lightbulb } from 'lucide-react'
import Header from './components/Header'
import KPISection from './components/KPISection'
import BCGMatrix from './components/BCGMatrix'
import CategoryPanel from './components/CategoryPanel'
import { TrendGrid, TrendAreaChart, ScoreRadarChart } from './components/TrendCharts'
import { AlertsPanel, RecommendationsPanel } from './components/AlertsPanel'
import { useData, useKioskMode } from './hooks/useData'

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'alerts', label: 'Alerts & Signals', icon: Bell },
  { id: 'strategy', label: 'AI Strategy', icon: Lightbulb },
]

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 grid-bg">
      <div className="scan-line" />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
        <div className="font-display text-5xl tracking-[0.3em] text-white mb-1">ROOMART</div>
        <div className="font-display text-xl tracking-[0.5em] text-gold-400 mb-8">BCG INTELLIGENCE</div>
        <div className="flex items-center justify-center gap-3 text-white/40">
          <Loader2 size={16} className="animate-spin text-gold-400" />
          <span className="text-sm font-mono tracking-widest">INITIALIZING INTELLIGENCE ENGINE...</span>
        </div>
        <div className="mt-6 flex gap-1 justify-center">
          {[...Array(8)].map((_, i) => (
            <motion.div key={i} className="w-1 bg-gold-500/40 rounded-full"
              animate={{ height: [8, 32, 8] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }} />
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function ErrorScreen({ error, onRetry }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md p-8">
        <WifiOff size={40} className="text-red-400 mx-auto mb-4" />
        <h2 className="font-display text-2xl text-white tracking-wider mb-2">DATA CONNECTION ERROR</h2>
        <p className="text-white/40 text-sm font-mono mb-6">{error}</p>
        <p className="text-white/25 text-xs font-mono mb-6">
          Ensure data JSON files exist in /public/data/ directory.<br />
          Run: <code className="text-gold-400">python backend/seed_data.py</code>
        </p>
        <button onClick={onRetry}
          className="px-6 py-2 rounded-lg bg-gold-500/20 border border-gold-500/40 text-gold-400 text-sm font-mono hover:bg-gold-500/30 transition-all">
          RETRY CONNECTION
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const { data, loading, error, lastUpdated, refetch } = useData(30 * 60 * 1000)
  const { isKiosk, toggleKiosk } = useKioskMode()
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  if (loading) return <LoadingScreen />
  if (error) return <ErrorScreen error={error} onRetry={refetch} />

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      <div className="scan-line" />
      <Header lastUpdated={lastUpdated} onRefresh={refetch} isKiosk={isKiosk} onToggleKiosk={toggleKiosk} loading={loading} />

      <div className="flex items-center gap-1 px-6 pt-4 border-b border-white/5">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const highAlerts = tab.id === 'alerts' ? data?.alerts?.filter(a => a.severity === 'HIGH').length : 0
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[11px] font-mono tracking-widest uppercase transition-all rounded-t-lg border-b-2 -mb-px ${
                isActive ? 'text-gold-400 border-gold-400 bg-gold-400/5' : 'text-white/30 border-transparent hover:text-white/60'
              }`}>
              <Icon size={12} />
              {tab.label}
              {highAlerts > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center">{highAlerts}</span>
              )}
            </button>
          )
        })}
      </div>

      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }} className="p-5 space-y-4">
            {activeTab === 'overview' && (
              <>
                <KPISection kpis={data?.kpis} />
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4" style={{ minHeight: '480px' }}>
                  <div className="xl:col-span-3">
                    <BCGMatrix categories={data?.categories} onSelectCategory={setSelectedCategory} selectedCategory={selectedCategory} />
                  </div>
                  <div className="xl:col-span-2">
                    <CategoryPanel categories={data?.categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2" style={{ minHeight: '280px' }}>
                    <AlertsPanel alerts={data?.alerts?.slice(0, 4)} />
                  </div>
                  <div><ScoreRadarChart categories={data?.categories} /></div>
                </div>
              </>
            )}
            {activeTab === 'trends' && (
              <>
                <TrendAreaChart trends={data?.trends} />
                <TrendGrid trends={data?.trends} />
              </>
            )}
            {activeTab === 'alerts' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div style={{ minHeight: '600px' }}><AlertsPanel alerts={data?.alerts} /></div>
                <div><ScoreRadarChart categories={data?.categories} /></div>
              </div>
            )}
            {activeTab === 'strategy' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div style={{ minHeight: '600px' }}><RecommendationsPanel categories={data?.categories} /></div>
                <div>
                  <CategoryPanel categories={data?.categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <div className="flex items-center justify-between px-6 py-2 border-t border-white/5 flex-shrink-0">
        <div className="flex items-center gap-4 text-[9px] font-mono text-white/15">
          <span>RoomArt BCG Intelligence Platform</span>
          <span>·</span>
          <span>Python + React + GitHub Actions</span>
        </div>
        <div className="text-[9px] font-mono text-white/15">Auto-refresh every 6h via GitHub Actions</div>
      </div>
    </div>
  )
}
