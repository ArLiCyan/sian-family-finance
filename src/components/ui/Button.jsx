import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

const variants = {
  primary: 'bg-sage-700 text-white hover:bg-sage-800 dark:bg-sage-600 dark:hover:bg-sage-500',
  secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-sage-800 dark:text-gray-100 dark:hover:bg-sage-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-sage-800',
  outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-sage-600 dark:text-gray-200 dark:hover:bg-sage-800',
}

const sizes = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}
