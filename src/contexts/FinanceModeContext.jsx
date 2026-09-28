import { createContext, useContext, useState, useCallback, useMemo } from 'react'

const FinanceModeContext = createContext(null)
const STORAGE_KEY = 'sian_finance_mode'

export function FinanceModeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'private' ? 'private' : 'family'
    } catch {
      return 'family'
    }
  })

  const setMode = useCallback((next) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleMode = useCallback(() => {
    setMode(mode === 'family' ? 'private' : 'family')
  }, [mode, setMode])

  const value = useMemo(
    () => ({ mode, isFamily: mode === 'family', isPrivate: mode === 'private', setMode, toggleMode }),
    [mode, setMode, toggleMode]
  )

  return <FinanceModeContext.Provider value={value}>{children}</FinanceModeContext.Provider>
}

export function useFinanceMode() {
  const ctx = useContext(FinanceModeContext)
  if (!ctx) throw new Error('useFinanceMode must be used within FinanceModeProvider')
  return ctx
}
