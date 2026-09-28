import clsx from 'clsx'

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-sage-800 mb-5">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={clsx(
            'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            active === tab.value
              ? 'border-sage-600 text-sage-700 dark:border-sage-400 dark:text-sage-300'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
