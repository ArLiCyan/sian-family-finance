// Lightweight localStorage draft persistence for in-progress forms. Browsers
// (Chrome's Memory Saver, Edge's sleeping tabs, etc.) can fully discard a
// backgrounded tab to save memory — switching back reloads the page from
// scratch and silently wipes any unsaved React state. This can't be prevented
// from the app, so instead every keystroke is mirrored to localStorage and
// restored on reopen, making that reload harmless instead of losing data.

const MAX_AGE_MS = 24 * 60 * 60 * 1000 // ignore drafts older than this

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

export function saveDraft(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }))
  } catch {
    /* ignore (private browsing, storage full, etc.) */
  }
}

export function clearDraft(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
