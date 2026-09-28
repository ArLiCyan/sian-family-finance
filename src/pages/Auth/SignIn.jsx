import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase, setRememberMe } from '../../lib/supabase'
import AuthLayout from './AuthLayout'
import { Field, Input } from '../../components/ui/FormField'
import Button from '../../components/ui/Button'

export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    setRememberMe(remember)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) {
      setError(signInError.message === 'Invalid login credentials' ? 'Incorrect email or password.' : signInError.message)
      return
    }
    navigate(location.state?.from ?? '/', { replace: true })
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your family finance account" photo>
      <form onSubmit={handleSubmit}>
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Password" required>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <label className="mb-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-sage-600 focus:ring-sage-500"
          />
          Remember me on this device
        </label>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Sign In
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/forgot-password" className="text-sage-600 hover:underline dark:text-sage-400">
          Forgot password?
        </Link>
        <Link to="/signup" className="text-sage-600 hover:underline dark:text-sage-400">
          Create account
        </Link>
      </div>
    </AuthLayout>
  )
}
