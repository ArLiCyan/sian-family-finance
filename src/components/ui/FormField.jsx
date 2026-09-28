import clsx from 'clsx'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-sage-500 focus:outline-none focus:ring-1 focus:ring-sage-500 dark:border-sage-700 dark:bg-sage-950 dark:text-gray-100'

export function Field({ label, error, required, children, hint }) {
  return (
    <div className="mb-4">
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function Input({ className, ...props }) {
  return <input className={clsx(inputClass, className)} {...props} />
}

export function Textarea({ className, ...props }) {
  return <textarea className={clsx(inputClass, className)} rows={3} {...props} />
}

export function Select({ className, children, ...props }) {
  return (
    <select className={clsx(inputClass, className)} {...props}>
      {children}
    </select>
  )
}
