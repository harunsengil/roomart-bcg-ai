import { useState, useEffect, useCallback } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('roomart-theme') || 'dark'
  })

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('roomart-theme', next)
      return next
    })
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.classList.add('light')
      root.classList.remove('dark')
    } else {
      root.classList.add('dark')
      root.classList.remove('light')
    }
  }, [theme])

  return { theme, toggleTheme, isDark: theme === 'dark' }
}

// Reaktif "light mı?" — documentElement .light class'ını MutationObserver ile izler.
// Prop-drilling olmadan herhangi bir bileşende kullanılabilir; tema değişince re-render eder.
export function useIsLight() {
  const [light, setLight] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  )
  useEffect(() => {
    const el = document.documentElement
    const update = () => setLight(el.classList.contains('light'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return light
}
