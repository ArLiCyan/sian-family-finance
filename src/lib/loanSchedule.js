// Builds a virtual monthly installment schedule for a loan and matches actual
// payments against it (FIFO) to work out, per installment: due date, whether
// it's been paid, and (if paid) which date it was paid on. Nothing here is
// stored — it's recomputed from debts.installment_amount + debts.start_date
// + the actual debt_payments rows every time it's needed, so it can never
// drift out of sync with the real ledger.

const MAX_INSTALLMENTS = 120 // 10 years monthly — a sanity cap, not a real limit

// Last valid calendar day of (year, monthIndex) — handles Feb/30-day months.
function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

// Fixed billing day (e.g. "every 5th"), clamped to the month's actual length
// (so day 31 falls back to Feb 28/29, Apr 30, etc., like real billing does).
function dueDateForMonth(year, monthIndex, day) {
  return new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)))
}

export function computeInstallmentSchedule(debt, payments) {
  const installmentAmt = Number(debt.installment_amount)
  const original = Number(debt.original_amount)
  if (!installmentAmt || installmentAmt <= 0 || !original || original <= 0) return null

  const numInstallments = Math.ceil(original / installmentAmt)
  if (numInstallments > MAX_INSTALLMENTS) return { tooMany: true, numInstallments }

  const start = new Date(debt.start_date)
  const today = new Date()
  const dueDay = debt.due_day_of_month ? Number(debt.due_day_of_month) : null

  // With a fixed billing day, find the first occurrence strictly after the
  // start date, then step forward one calendar month at a time from there.
  let firstDueYear, firstDueMonth
  if (dueDay) {
    firstDueYear = start.getFullYear()
    firstDueMonth = start.getMonth()
    if (dueDateForMonth(firstDueYear, firstDueMonth, dueDay) <= start) firstDueMonth += 1
  }

  // Local mutable copy: { date: Date, remaining: number }
  const pool = [...payments]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((p) => ({ date: new Date(p.date), remaining: Number(p.amount) }))

  // pool[payIdx] carries any leftover `remaining` forward automatically —
  // a payment bigger than one installment satisfies several in a row.
  let payIdx = 0

  const schedule = []
  for (let i = 1; i <= numInstallments; i++) {
    let dueDate
    if (dueDay) {
      dueDate = dueDateForMonth(firstDueYear, firstDueMonth + (i - 1), dueDay)
    } else {
      dueDate = new Date(start)
      dueDate.setMonth(dueDate.getMonth() + i)
    }
    const expected = i === numInstallments ? original - installmentAmt * (numInstallments - 1) : installmentAmt

    let allocated = 0
    let paidDate = null

    while (allocated < expected - 0.005 && payIdx < pool.length) {
      const need = expected - allocated
      const p = pool[payIdx]
      if (p.remaining <= need + 0.005) {
        allocated += p.remaining
        paidDate = p.date
        payIdx++
      } else {
        allocated += need
        p.remaining -= need
        paidDate = p.date
        break
      }
    }

    const isPaid = allocated >= expected - 0.005
    const status = isPaid ? 'paid' : allocated > 0 ? 'partial' : dueDate < today ? 'overdue' : 'upcoming'

    schedule.push({ number: i, dueDate, expected, paidAmount: allocated, paidDate: isPaid || allocated > 0 ? paidDate : null, status })
  }

  return { installments: schedule, tooMany: false }
}
