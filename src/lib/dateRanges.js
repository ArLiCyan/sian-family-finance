function fmt(d) {
  return d.toISOString().slice(0, 10)
}

export function getPresetRange(preset) {
  const now = new Date()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  switch (preset) {
    case 'this_week': {
      const start = startOfDay(now)
      start.setDate(start.getDate() - start.getDay())
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return { start: fmt(start), end: fmt(end) }
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { start: fmt(start), end: fmt(end) }
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: fmt(start), end: fmt(end) }
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31)
      return { start: fmt(start), end: fmt(end) }
    }
    default:
      return getPresetRange('this_month')
  }
}

export const rangePresets = [
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
]
