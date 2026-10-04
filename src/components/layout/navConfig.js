import {
  LayoutDashboard, ArrowLeftRight, Wallet, FolderKanban,
  Landmark, PiggyBank, FileBarChart, Users, Megaphone, Shield, Settings, Store,
} from 'lucide-react'

export const familyNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/debts', label: 'Loan', icon: Landmark },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank, adminOnly: true },
  { to: '/sari-sari-store', label: 'InvenTrack', icon: Store, adminOnly: true },
  { to: '/reports', label: 'Reports', icon: FileBarChart, adminOnly: true },
  { to: '/members', label: 'Members', icon: Users, adminOnly: true },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, adminOnly: true },
]

export const privateNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/debts', label: 'Loans', icon: Landmark },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
]

export const globalBottomNav = [
  { to: '/admin', label: 'Admin', icon: Shield },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Plain members only see the items that aren't marked adminOnly.
export function visibleNav(items, role) {
  const isAdmin = role === 'owner' || role === 'admin'
  return items.filter((item) => isAdmin || !item.adminOnly)
}
