import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Wallet, Shield, Settings } from 'lucide-react'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { useAuth } from '../../contexts/AuthContext'
import { familyNav, privateNav, visibleNav } from './navConfig'
import ModeSwitcher from './ModeSwitcher'

function NavItem({ item }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sage-700 text-white'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-sage-800'
        )
      }
    >
      <item.icon className="h-4.5 w-4.5 shrink-0" />
      {item.label}
    </NavLink>
  )
}

export default function Sidebar() {
  const { isFamily } = useFinanceMode()
  const { role } = useAuth()
  const items = visibleNav(isFamily ? familyNav : privateNav, role)

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col border-r border-gray-200 dark:border-sage-800 bg-white dark:bg-sage-900 h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sage-700 text-white">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-gray-900 dark:text-gray-100">SIAN Family</p>
          <p className="text-xs text-gray-400">Finance</p>
        </div>
      </div>
      <div className="px-4 pb-4">
        <ModeSwitcher />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {items.map((item) => (
          <NavItem key={item.to} item={item} />
        ))}
      </nav>
      <div className="space-y-1 border-t border-gray-100 dark:border-sage-800 px-3 py-3">
        {(role === 'owner' || role === 'admin') && <NavItem item={{ to: '/admin', label: 'Admin', icon: Shield }} />}
        <NavItem item={{ to: '/settings', label: 'Settings', icon: Settings }} />
      </div>
    </aside>
  )
}
