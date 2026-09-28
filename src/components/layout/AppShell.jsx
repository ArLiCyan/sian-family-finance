import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNav from './MobileNav'

export default function AppShell() {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-sage-950">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Topbar />
        <main className="mx-auto max-w-6xl px-4 py-5 pb-24 md:px-6 md:pb-8">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
