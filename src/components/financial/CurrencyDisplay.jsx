import clsx from 'clsx'
import { formatCurrency } from '../../lib/format'

export default function CurrencyDisplay({ amount, className, positive, negative, currency = 'PHP' }) {
  return (
    <span
      className={clsx(
        'tabular-nums',
        positive && 'text-green-600 dark:text-green-400',
        negative && 'text-red-600 dark:text-red-400',
        className
      )}
    >
      {formatCurrency(amount, currency)}
    </span>
  )
}
