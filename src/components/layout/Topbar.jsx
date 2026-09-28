import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Moon, Sun, Monitor, LogOut, User, ChevronDown } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { useTheme } from '../../contexts/ThemeContext'
import { initials } from '../../lib/format'
import NotificationBell from './NotificationBell'

export default function Topbar() {
  const { profile, signOut } = useAuth()
  const { isFamily } = useFinanceMode()
  const { theme, setTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const cycleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/80 dark:border-sage-800 dark:bg-sage-950/80 backdrop-blur px-4 py-3 md:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sage-600 dark:text-sage-400">
          {isFamily ? 'SIAN Family Finance' : 'My Private Finances'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={cycleTheme}
          title={`Theme: ${theme}`}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-sage-800"
        >
          <ThemeIcon className="h-5 w-5" />
        </button>
        <NotificationBell />
        <div className="relative" ref={ref}>
          <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-gray-100 dark:hover:bg-sage-800">
            {profile?.profile_photo_url ? (
              <img src={profile.profile_photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sage-100 text-xs font-semibold text-sage-700 dark:bg-sage-800 dark:text-sage-300">
                {initials(profile?.display_name)}
              </div>
            )}
            <ChevronDown className="hidden sm:block h-4 w-4 text-gray-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-sage-800 dark:bg-sage-900">
              <div className="border-b border-gray-100 dark:border-sage-800 px-3 py-2.5">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{profile?.display_name}</p>
                <p className="truncate text-xs text-gray-400">{profile?.email}</p>
              </div>
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-sage-800"
              >
                <User className="h-4 w-4" /> Profile Settings
              </Link>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-gray-50 dark:hover:bg-sage-800"
              >
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
