import clsx from 'clsx'

export default function Card({ children, className, padded = true, ...props }) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-gray-200 bg-white dark:border-sage-800 dark:bg-sage-900',
        padded && 'p-4 sm:p-5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
