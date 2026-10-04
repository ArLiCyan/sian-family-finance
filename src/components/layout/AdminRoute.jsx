import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'

// Keeps plain members out of pages that are for owners/admins only, even if they
// type the address by hand. Pages that also exist in Private mode (Budgets,
// Reports) pass familyOnly so members still reach their own private copy.
export default function AdminRoute({ children, familyOnly = false }) {
  const { role } = useAuth()
  const { isFamily } = useFinanceMode()
  const isAdmin = role === 'owner' || role === 'admin'
  if (!isAdmin && (!familyOnly || isFamily)) return <Navigate to="/" replace />
  return children
}
