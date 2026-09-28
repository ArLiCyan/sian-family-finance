import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import PageHeader from '../../components/layout/PageHeader'
import Card, { CardHeader } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/FormField'
import { initials } from '../../lib/format'

export default function Settings() {
  const { profile, refreshProfile } = useAuth()
  const { theme, setTheme } = useTheme()
  const [form, setForm] = useState({ first_name: profile?.first_name ?? '', last_name: profile?.last_name ?? '', phone: profile?.phone ?? '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [pwForm, setPwForm] = useState({ password: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('profiles').update({
      first_name: form.first_name,
      last_name: form.last_name,
      display_name: `${form.first_name} ${form.last_name}`.trim(),
      phone: form.phone || null,
    }).eq('id', profile.id)
    setSaving(false)
    setSaved(true)
    refreshProfile()
    setTimeout(() => setSaved(false), 2000)
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (!error) {
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ profile_photo_url: pub.publicUrl }).eq('id', profile.id)
      refreshProfile()
    }
    setUploading(false)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwError('')
    if (pwForm.password !== pwForm.confirm) {
      setPwError('Passwords do not match.')
      return
    }
    if (pwForm.password.length < 8) {
      setPwError('Password must be at least 8 characters.')
      return
    }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.password })
    setPwSaving(false)
    if (error) {
      setPwError(error.message)
      return
    }
    setPwForm({ password: '', confirm: '' })
    setPwSaved(true)
    setTimeout(() => setPwSaved(false), 2000)
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your profile and preferences" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <div className="mb-4 flex items-center gap-4">
            {profile?.profile_photo_url ? (
              <img src={profile.profile_photo_url} className="h-16 w-16 rounded-full object-cover" alt="" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sage-100 text-lg font-semibold text-sage-700 dark:bg-sage-800 dark:text-sage-300">
                {initials(profile?.display_name)}
              </div>
            )}
            <label className="cursor-pointer text-sm text-sage-600 hover:underline dark:text-sage-400">
              {uploading ? 'Uploading…' : 'Change Photo'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
            </label>
          </div>
          <form onSubmit={handleSaveProfile}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" required>
                <Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
              </Field>
              <Field label="Last Name" required>
                <Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
              </Field>
            </div>
            <Field label="Email">
              <Input value={profile?.email ?? ''} disabled />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            <Button type="submit" loading={saving}>{saved ? 'Saved!' : 'Save Profile'}</Button>
          </form>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Appearance" />
            <div className="flex gap-2">
              {['light', 'dark', 'system'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize ${theme === t ? 'border-sage-600 bg-sage-50 text-sage-700 dark:bg-sage-800 dark:text-sage-300' : 'border-gray-200 text-gray-600 dark:border-sage-700 dark:text-gray-300'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Change Password" />
            <form onSubmit={handleChangePassword}>
              <Field label="New Password" required>
                <Input type="password" value={pwForm.password} onChange={(e) => setPwForm((f) => ({ ...f, password: e.target.value }))} />
              </Field>
              <Field label="Confirm New Password" required>
                <Input type="password" value={pwForm.confirm} onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} />
              </Field>
              {pwError && <p className="mb-3 text-sm text-red-600">{pwError}</p>}
              <Button type="submit" loading={pwSaving}>{pwSaved ? 'Updated!' : 'Update Password'}</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
