import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. Copy .env.example to .env and fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.'
  )
}

const REMEMBER_ME_KEY = 'sian_remember_me'

// "Remember me" support: the session itself always lives in localStorage or
// sessionStorage depending on this flag (set once, at sign-in time), while
// the flag itself always lives in localStorage so the choice survives
// restarts. localStorage = persists after closing the browser. sessionStorage
// = cleared when the browser/tab closes, but still survives a plain refresh.
export function setRememberMe(remember) {
  try {
    localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

function getPreferredStorage() {
  try {
    return localStorage.getItem(REMEMBER_ME_KEY) === 'false' ? sessionStorage : localStorage
  } catch {
    return localStorage
  }
}

const authStorage = {
  getItem: (key) => getPreferredStorage().getItem(key),
  setItem: (key, value) => getPreferredStorage().setItem(key, value),
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
})
