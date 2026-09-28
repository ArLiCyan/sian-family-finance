import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'
import { Field, Input } from '../../components/ui/FormField'
import Button from '../../components/ui/Button'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email" subtitle="Password reset link sent">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          If an account exists for <strong>{email}</strong>, a password reset link has been sent.
        </p>
        <Link to="/login" className="mt-4 inline-block text-sm text-sage-600 hover:underline dark:text-sage-400">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="We'll email you a reset link">
      <form onSubmit={handleSubmit}>
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Send Reset Link
        </Button>
      </form>
      <Link to="/login" className="mt-4 inline-block text-sm text-sage-600 hover:underline dark:text-sage-400">
        Back to sign in
      </Link>
    </AuthLayout>
  )
}
