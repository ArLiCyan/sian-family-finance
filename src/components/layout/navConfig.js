import {
  LayoutDashboard, ArrowLeftRight, Wallet, HandCoins, FolderKanban, Target,
  Landmark, PiggyBank, FileBarChart, Users, Megaphone, Shield, Settings, Store,
} from 'lucide-react'

export const familyNav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/contributions', label: 'Contributions', icon: HandCoins },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/debts', label: 'Loan', icon: Landmark },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/sari-sari-store', label: 'InvenTrack', icon: Store },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
]

export const privateNav = [
  { to: '/', label: 'My Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'My Transactions', icon: ArrowLeftRight },
  { to: '/accounts', label: 'My Accounts', icon: Wallet },
  { to: '/goals', label: 'My Goals', icon: Target },
  { to: '/debts', label: 'My Debts', icon: Landmark },
  { to: '/budgets', label: 'My Budgets', icon: PiggyBank },
  { to: '/reports', label: 'My Reports', icon: FileBarChart },
]

export const globalBottomNav = [
  { to: '/admin', label: 'Admin', icon: Shield },
  { to: '/settings', label: 'Settings', icon: Settings },
]
