import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'
import { Field, Input } from '../../components/ui/FormField'
import Button from '../../components/ui/Button'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setDone(true)
    setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a strong password for your account">
      {done ? (
        <p className="text-sm text-green-700 dark:text-green-400">Password updated. Redirecting…</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <Field label="New password" required hint="At least 8 characters">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          </Field>
          <Field label="Confirm new password" required>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </Field>
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Update Password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
