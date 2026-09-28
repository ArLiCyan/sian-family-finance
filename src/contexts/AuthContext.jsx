import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null)
  const [family, setFamily] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfileData = useCallback(async (userId) => {
    const { data: profileRow, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', userId)
      .maybeSingle()

    if (profileErr || !profileRow) {
      setProfile(null)
      setFamily(null)
      setMembership(null)
      return
    }
    setProfile(profileRow)

    const { data: membershipRow } = await supabase
      .from('family_memberships')
      .select('*, families(*)')
      .eq('profile_id', profileRow.id)
      .eq('status', 'active')
      .maybeSingle()

    if (membershipRow) {
      setMembership(membershipRow)
      setFamily(membershipRow.families)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await loadProfileData(session.user.id)
    }
  }, [session, loadProfileData])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      if (session === undefined) return
      if (session?.user?.id) {
        await loadProfileData(session.user.id)
      } else {
        setProfile(null)
        setFamily(null)
        setMembership(null)
      }
      if (!cancelled) setLoading(false)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [session, loadProfileData])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    family,
    membership,
    role: membership?.role ?? null,
    loading: session === undefined || loading,
    refreshProfile,
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
