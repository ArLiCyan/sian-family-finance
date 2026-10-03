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
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/sari-sari-store', label: 'InvenTrack', icon: Store },
  { to: '/reports', label: 'Reports', icon: FileBarChart },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
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
