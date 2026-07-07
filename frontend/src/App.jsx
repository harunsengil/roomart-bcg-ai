import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, WifiOff, LayoutDashboard, TrendingUp, Bell, Lightbulb, Table2, Swords } from 'lucide-react'
import Header from './components/Header'
import KPISection from './components/KPISection'
import BCGMatrix from './components/BCGMatrix'
import CategoryPanel from './components/CategoryPanel'
import { TrendGrid, TrendAreaChart, ScoreRadarChart } from './components/TrendCharts'
import { AlertsPanel, RecommendationsPanel } from './components/AlertsPanel'
import { useData, useKioskMode } from './hooks/useData'
import ProductTable from './components/ProductTable'
import CompetitionTab from './components/CompetitionTab'
import LoginScreen from './components/LoginScreen'
import { useTheme } from './hooks/useTheme'
import { useAuth } from './hooks/useAuth'

// shortLabel: mobilde (sm altında) gösterilir; label: sm+ ekranlarda
const TABS = [
  { id: 'overview',    label: 'Overview',        shortLabel: 'Overview',    icon: LayoutDashboard },
  { id: 'products',    label: 'Products',         shortLabel: 'Ürünler',     icon: Table2 },
  { id: 'competition', label: 'Competition',      shortLabel: 'Rekabet',     icon: Swords },
  { id: 'trends',      label: 'Trends',           shortLabel: 'Trends',      icon: TrendingUp },
  { id: 'alerts',      label: 'Alerts & Signals', shortLabel: 'Uyarılar',    icon: Bell },
  { id: 'strategy',    label: 'AI Strategy',      shortLabel: 'Strateji',    icon: Lightbulb },
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
              animate={{ height: [8, 32, 8] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }} />
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
        <button onClick={onRetry}
          className="px-6 py-2 rounded-lg bg-gold-500/20 border border-gold-500/40 text-gold-400 text-sm font-mono hover:bg-gold-500/30 transition-all">
          RETRY CONNECTION
        </button>
      </div>
    </div>
  )
}

function Dashboard({ onLogout, userEmail }) {
  const { data, loading, error, lastUpdated, refetch } = useData(30 * 60 * 1000)
  const { isKiosk, toggleKiosk } = useKioskMode()
  const { theme, toggleTheme } = useTheme()
  const [selectedCategory, setSelectedCategory] = useState(null)        // Overview (matris + panel)
  const [strategyCategory, setStrategyCategory] = useState(null)        // AI Strategy paneli (bağımsız)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  const [productSearch, setProductSearch] = useState('')                 // Alerts → Products navigasyonu

  // Uyarıdan ürün sayfasına git: product_id → ürün adıyla arama (id SEARCH_FIELDS'ta yok, name var)
  const goToProduct = (productId) => {
    const product = data?.products?.find(p => String(p.id) === String(productId))
    setProductSearch(product?.name || String(productId || ''))
    setActiveTab('products')
  }
  // AI Strategy → Overview: kategori seçili olarak BCG'ye git
  const goToCategory = (cat) => {
    setSelectedCategory(cat)
    setSelectedProduct(null)
    setActiveTab('overview')
  }

  // 15 saniye sonra hâlâ loading'deyse timeout ekranı göster
  useEffect(() => {
    if (!loading) { setLoadingTimeout(false); return }
    const t = setTimeout(() => setLoadingTimeout(true), 15000)
    return () => clearTimeout(t)
  }, [loading])

  if (loading && !loadingTimeout) return <LoadingScreen />
  if (loadingTimeout && loading) return <ErrorScreen error="Veri yüklenemedi — sunucu yanıt vermedi (15s). JSON yedeğine geçiliyor..." onRetry={refetch} />
  if (error) return <ErrorScreen error={error} onRetry={refetch} />

  const highAlertCount = [
    ...(data?.alerts || []),
    ...(data?.competitive?.alerts || []),
  ].filter(a => a.severity === 'HIGH').length

  return (
    <div className={`h-[100dvh] overflow-hidden grid-bg flex flex-col ${theme}`}>
      <div className="scan-line" />

      <Header
        lastUpdated={lastUpdated}
        onRefresh={refetch}
        isKiosk={isKiosk}
        onToggleKiosk={toggleKiosk}
        loading={loading}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={onLogout}
        userEmail={userEmail}
      />

      {/* ── TAB BAR ───────────────────────────────────── */}
      <div
        className="tab-bar flex-shrink-0 flex items-center gap-1 px-3 sm:px-6 pt-3 border-b transition-all duration-300 overflow-x-auto"
        style={{ position: 'relative', zIndex: 200 }}
      >
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const badgeCount = tab.id === 'alerts' ? highAlertCount : 0

          return (
            <button
              key={tab.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
              style={{ position: 'relative', zIndex: 201, cursor: 'pointer' }}
              className={[
                'flex items-center gap-2 px-3 sm:px-4 py-2.5 select-none flex-shrink-0 whitespace-nowrap',
                'text-[11px] font-mono tracking-widest uppercase',
                'transition-all duration-200 rounded-t-lg border-b-2 -mb-px',
                isActive
                  ? 'text-gold-400 border-gold-400 bg-gold-400/5'
                  : 'tab-inactive border-transparent hover:bg-white/5',
              ].join(' ')}
            >
              <Icon size={12} />
              <span className="hidden xs:inline sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {badgeCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center font-bold">
                  {badgeCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="p-2 xs:p-3 sm:p-5 space-y-3 sm:space-y-4"
          >
            {/* ── OVERVIEW ── */}
            {activeTab === 'overview' && (
              <>
                {data?.kpis && !data.kpis.growth_confident && (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                    <p className="text-[11px] font-mono text-amber-200/70 leading-snug">
                      Veri olgunlaşıyor — <b className="text-amber-300">{data.kpis.data_days}/14 gün</b>.
                      {data.kpis.growth_axis_active
                        ? ' Büyüme ekseni aktif ama momentum güveni için '
                        : ' Momentum henüz ölçülemiyor; '}
                      <b className="text-amber-300">{data.kpis.days_until_confident} gün</b> daha gerekiyor.
                      Erken dönem kadranları kesin değil.
                    </p>
                  </div>
                )}
                <KPISection kpis={data?.kpis} categories={data?.categories} />
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 xl:gap-4" style={{ minHeight: 480 }}>
                  <div className="xl:col-span-3">
                    <BCGMatrix
                      products={data?.products}
                      categories={data?.categories}
                      onSelectCategory={setSelectedCategory}
                      selectedCategory={selectedCategory}
                      onSelectProduct={setSelectedProduct}
                      selectedProduct={selectedProduct}
                    />
                  </div>
                  <div className="xl:col-span-2">
                    <CategoryPanel
                      categories={data?.categories}
                      selectedCategory={selectedCategory}
                      onSelectCategory={(c) => { setSelectedCategory(c); setSelectedProduct(null) }}
                      selectedProduct={selectedProduct}
                      onClearProduct={() => setSelectedProduct(null)}
                      onGoToProduct={goToProduct}
                    />
                  </div>
                </div>
                {/* STRATEGIC ALERTS + PERFORMANCE RADAR Overview'dan kaldırıldı —
                    ALERTS & SIGNALS sekmesinde zaten var (tekrar önlendi). */}
              </>
            )}

            {/* ── PRODUCTS ── */}
            {activeTab === 'products' && (
              <ProductTable key={productSearch} products={data?.products ?? []} initialSearch={productSearch} />
            )}

            {/* ── REKABET ── */}
            {activeTab === 'competition' && (
              <CompetitionTab data={data?.competitive} />
            )}

            {/* ── TRENDS ── */}
            {activeTab === 'trends' && (
              <>
                <TrendAreaChart trends={data?.trends} />
                <TrendGrid trends={data?.trends} />
              </>
            )}

            {/* ── ALERTS ── Mobil: tek kolon scroll | Masaüstü: sol scroll + sağ sabit radar */}
            {activeTab === 'alerts' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch xl:h-[calc(100vh-180px)]">
                <div className="min-h-0 xl:h-full">
                  <AlertsPanel
                    alerts={data?.alerts}
                    competitive={data?.competitive}
                    onNavigateToCompetition={() => setActiveTab('competition')}
                    onGoToProduct={goToProduct}
                  />
                </div>
                <div className="hidden xl:block min-h-0 xl:h-full">
                  <ScoreRadarChart categories={data?.categories} theme={theme} />
                </div>
              </div>
            )}

            {/* ── AI STRATEGY ── */}
            {activeTab === 'strategy' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div style={{ minHeight: 600 }}>
                  <RecommendationsPanel
                    categories={data?.categories}
                    onGoToCategory={goToCategory}
                  />
                </div>
                <div>
                  <CategoryPanel
                    categories={data?.categories}
                    selectedCategory={strategyCategory}
                    onSelectCategory={setStrategyCategory}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── FOOTER ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-2 border-t border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-4 text-[9px] font-mono text-white/15 min-w-0 truncate">
          <span className="truncate">RoomArt BCG Intelligence Platform</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Python + React + GitHub Actions</span>
          <span className="hidden sm:inline">·</span>
          <span className="capitalize hidden sm:inline">{theme} mode</span>
        </div>
        <div className="text-[9px] font-mono text-white/15 hidden md:block flex-shrink-0">
          Auto-refresh every 30 min · Data updated every 6h via GitHub Actions
        </div>
      </div>
    </div>
  )
}

// ── AUTH GATE (Seviye A arayüz kilidi) ──────────────────────────────────────
// Dashboard yalnız giriş yapıldıktan sonra render edilir → veri (useData) de
// ancak o zaman yüklenir. Hesaplar Firebase Console'da elle açılır.
export default function App() {
  const { user, loading, error, login, logout, resetPassword, setError } = useAuth()

  if (loading) return <LoadingScreen />
  if (!user) return <LoginScreen login={login} error={error} setError={setError} resetPassword={resetPassword} />
  return <Dashboard onLogout={logout} userEmail={user.email} />
}
