'use client'

import * as React from 'react'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface CPThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const CPThemeContext = createContext<CPThemeContextValue | undefined>(undefined)

export { CPThemeContext }

const STORAGE_KEY = 'cp-theme'

export function useCPTheme() {
  const ctx = useContext(CPThemeContext)
  if (!ctx) {
    throw new Error('useCPTheme must be used within a CPThemeProvider')
  }
  return ctx
}

/**
 * Provides theme state scoped to the CP. Applies the `dark` class to a wrapper
 * <div> rather than <html>, so the marketing site is never affected.
 */
export function CPThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  // Read persisted theme on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
      if (stored === 'dark' || stored === 'light') {
        setThemeState(stored)
      }
    } catch {
      // localStorage unavailable
    }
    setMounted(true)
  }, [])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem(STORAGE_KEY, newTheme)
    } catch {
      // localStorage unavailable
    }
  }, [])

  // Remove any stale `dark` class from <html> that next-themes may have left behind.
  useEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])

  return (
    <CPThemeContext.Provider value={{ theme, setTheme }}>
      <div
        className={`${theme === 'dark' ? 'dark' : ''} min-h-svh bg-background text-foreground`}
        // Prevent flash: hide until mounted, then show with correct theme
        style={mounted ? undefined : { visibility: 'hidden' }}
      >
        {children}
      </div>
    </CPThemeContext.Provider>
  )
}
