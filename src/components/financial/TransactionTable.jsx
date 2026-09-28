import { Pencil, Trash2, Paperclip } from 'lucide-react'
import CurrencyDisplay from './CurrencyDisplay'
import Badge from '../ui/Badge'
import { formatDateShort } from '../../lib/format'
import { TRANSACTION_TYPE_LABELS } from '../../lib/api'

const INFLOW = new Set(['income', 'deposit', 'refund', 'loan_received'])
const OUTFLOW = new Set(['expense', 'withdrawal', 'debt_payment', 'loan_given', 'contribution'])

export default function TransactionTable({ transactions, onEdit, onDelete, canEdit }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Description</th>
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 pr-3 font-medium">Type</th>
            <th className="py-2 pr-3 font-medium">Account</th>
            <th className="py-2 pr-3 text-right font-medium">Amount</th>
            {canEdit && <th className="py-2 pl-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
          {transactions.map((t) => (
            <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-sage-800/50">
              <td className="py-2.5 pr-3 whitespace-nowrap text-gray-500">{formatDateShort(t.date)}</td>
              <td className="py-2.5 pr-3">
                <p className="font-medium text-gray-900 dark:text-gray-100">{t.description || '—'}</p>
                {t.merchant && <p className="text-xs text-gray-400">{t.merchant}</p>}
              </td>
              <td className="py-2.5 pr-3 text-gray-500">{t.categories?.name ?? '—'}</td>
              <td className="py-2.5 pr-3">
                <Badge color="gray">{TRANSACTION_TYPE_LABELS[t.type]}</Badge>
              </td>
              <td className="py-2.5 pr-3 text-gray-500">{t.financial_accounts?.name ?? '—'}</td>
              <td className="py-2.5 pr-3 text-right font-semibold">
                <span className="inline-flex items-center gap-1">
                  {t.has_attachment && <Paperclip className="h-3 w-3 text-gray-300" />}
                  <CurrencyDisplay
                    amount={t.amount}
                    positive={INFLOW.has(t.type)}
                    negative={OUTFLOW.has(t.type) || t.type === 'transfer'}
                  />
                </span>
              </td>
              {canEdit && (
                <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                  <button onClick={() => onEdit(t)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-sage-800">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => onDelete(t)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
