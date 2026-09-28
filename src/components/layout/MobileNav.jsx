import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Menu, X, Shield, Settings, LogOut } from 'lucide-react'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { useAuth } from '../../contexts/AuthContext'
import { familyNav, privateNav } from './navConfig'
import ModeSwitcher from './ModeSwitcher'

export default function MobileNav() {
  const { isFamily } = useFinanceMode()
  const { role, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const items = isFamily ? familyNav : privateNav
  const bottomItems = items.slice(0, 4)

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-gray-200 bg-white dark:border-sage-800 dark:bg-sage-900">
        {bottomItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium',
                isActive ? 'text-sage-700 dark:text-sage-300' : 'text-gray-400'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label.replace('Family ', '').replace('My ', '')}
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-gray-400">
          <Menu className="h-5 w-5" />
          Menu
        </button>
      </nav>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-white dark:bg-sage-950 flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-sage-800">
            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Menu</span>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-sage-800">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4">
            <ModeSwitcher compact />
          </div>
          <nav className="flex-1 overflow-y-auto px-4 space-y-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                    isActive ? 'bg-sage-700 text-white' : 'text-gray-600 dark:text-gray-300'
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
            {(role === 'owner' || role === 'admin') && (
              <NavLink
                to="/admin"
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', isActive ? 'bg-sage-700 text-white' : 'text-gray-600 dark:text-gray-300')
                }
              >
                <Shield className="h-5 w-5" /> Admin
              </NavLink>
            )}
            <NavLink
              to="/settings"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium', isActive ? 'bg-sage-700 text-white' : 'text-gray-600 dark:text-gray-300')
              }
            >
              <Settings className="h-5 w-5" /> Settings
            </NavLink>
          </nav>
          <button
            onClick={signOut}
            className="m-4 flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-sage-800 py-2.5 text-sm font-medium text-red-600"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      )}
    </>
  )
}
