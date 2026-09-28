import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'
import { Field, Input } from '../../components/ui/FormField'
import Button from '../../components/ui/Button'

export default function SignUp() {
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
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
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          display_name: `${firstName} ${lastName}`.trim(),
        },
      },
    })
    setLoading(false)
    if (signUpError) {
      setError(signUpError.message)
      return
    }
    if (data.session) {
      navigate('/', { replace: true })
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <AuthLayout title="Check your email" subtitle="One more step">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account and join the SIAN
          Family.
        </p>
        <Link to="/login" className="mt-4 inline-block text-sm text-sage-600 hover:underline dark:text-sage-400">
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Join the SIAN Family" subtitle="Create your account to manage family &amp; private finances">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
          </Field>
          <Field label="Last name" required>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </Field>
        </div>
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" required hint="At least 8 characters">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Confirm password" required>
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        </Field>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Create Account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
        Already have an account?{' '}
        <Link to="/login" className="text-sage-600 hover:underline dark:text-sage-400">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
