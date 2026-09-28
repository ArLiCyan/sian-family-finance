export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-sage-700 px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-gray-300 dark:text-sage-600" />}
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
      {message && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
