import clsx from 'clsx'

export default function ProgressBar({ percent, tone = 'navy', height = 'h-2' }) {
  const clamped = Math.max(0, Math.min(100, percent || 0))
  const toneClass = {
    navy: 'bg-sage-600',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }[tone]

  return (
    <div className={clsx('w-full overflow-hidden rounded-full bg-gray-100 dark:bg-sage-800', height)}>
      <div className={clsx('h-full rounded-full transition-all', toneClass)} style={{ width: `${clamped}%` }} />
    </div>
  )
}
