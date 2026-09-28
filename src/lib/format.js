export function formatCurrency(amount, currency = 'PHP') {
  const value = Number(amount ?? 0)
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
    ...opts,
  }).format(d)
}

export function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(d)
}

export function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(d)
}

export function initials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}
