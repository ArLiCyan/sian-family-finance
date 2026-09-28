import clsx from 'clsx'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { Users, Lock } from 'lucide-react'

export default function ModeSwitcher({ compact = false }) {
  const { mode, setMode } = useFinanceMode()

  return (
    <div
      className={clsx(
        'inline-flex rounded-lg bg-gray-100 p-1 dark:bg-sage-800',
        compact ? 'w-full' : ''
      )}
    >
      <button
        onClick={() => setMode('family')}
        className={clsx(
          'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex-1',
          mode === 'family'
            ? 'bg-white text-sage-700 shadow-sm dark:bg-sage-700 dark:text-white'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
        )}
      >
        <Users className="h-4 w-4" /> Family
      </button>
      <button
        onClick={() => setMode('private')}
        className={clsx(
          'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex-1',
          mode === 'private'
            ? 'bg-white text-sage-700 shadow-sm dark:bg-sage-700 dark:text-white'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
        )}
      >
        <Lock className="h-4 w-4" /> Private
      </button>
    </div>
  )
}
