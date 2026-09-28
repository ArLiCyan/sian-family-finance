import Card from '../ui/Card'
import CurrencyDisplay from './CurrencyDisplay'
import clsx from 'clsx'

export default function FinancialCard({ label, amount, icon: Icon, tone = 'default', suffix, isCurrency = true }) {
  const toneClass = {
    default: 'text-gray-900 dark:text-gray-100',
    positive: 'text-green-600 dark:text-green-400',
    negative: 'text-red-600 dark:text-red-400',
    navy: 'text-sage-700 dark:text-sage-300',
  }[tone]

  return (
    <Card className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <p className={clsx('mt-1.5 text-xl font-bold', toneClass)}>
          {isCurrency ? <CurrencyDisplay amount={amount} /> : amount}
          {suffix && <span className="ml-1 text-sm font-medium text-gray-400">{suffix}</span>}
        </p>
      </div>
      {Icon && (
        <div className="rounded-lg bg-sage-50 p-2 text-sage-600 dark:bg-sage-800 dark:text-sage-300">
          <Icon className="h-5 w-5" />
        </div>
      )}
    </Card>
  )
}
