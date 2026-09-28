import clsx from 'clsx'

const colors = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-sage-800 dark:text-gray-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  navy: 'bg-sage-100 text-sage-700 dark:bg-sage-800 dark:text-sage-200',
}

export default function Badge({ children, color = 'gray', className }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        colors[color],
        className
      )}
    >
      {children}
    </span>
  )
}

const contributionStatusColor = {
  pending: 'amber',
  submitted: 'blue',
  confirmed: 'green',
  partially_confirmed: 'blue',
  rejected: 'red',
  refunded: 'gray',
}
const projectStatusColor = {
  planning: 'gray',
  active: 'blue',
  on_hold: 'amber',
  completed: 'green',
  cancelled: 'red',
}
const debtStatusColor = {
  active: 'amber',
  partially_paid: 'blue',
  paid: 'green',
  overdue: 'red',
  cancelled: 'gray',
}
const goalStatusColor = {
  active: 'blue',
  completed: 'green',
  paused: 'amber',
  cancelled: 'red',
}

export function StatusBadge({ status, map = contributionStatusColor }) {
  const label = status?.replace(/_/g, ' ')
  return (
    <Badge color={map[status] || 'gray'} className="capitalize">
      {label}
    </Badge>
  )
}

export { contributionStatusColor, projectStatusColor, debtStatusColor, goalStatusColor }
