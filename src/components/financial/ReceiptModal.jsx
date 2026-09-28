import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import LoadingState from '../ui/LoadingState'

// Renders a receipt stored in the private "receipts" bucket inline, via a
// short-lived signed URL — never in a new tab, per the family's request to
// keep everything within the project page.
export default function ReceiptModal({ path, onClose }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }
    setError('')
    supabase.storage
      .from('receipts')
      .createSignedUrl(path, 300)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setUrl(data?.signedUrl)
      })
  }, [path])

  const isPdf = path?.toLowerCase().endsWith('.pdf')

  return (
    <Modal open={!!path} onClose={onClose} title="Receipt" size="lg">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !url ? (
        <LoadingState />
      ) : isPdf ? (
        <iframe src={url} title="Receipt" className="h-[70vh] w-full rounded-lg border border-gray-200 dark:border-sage-800" />
      ) : (
        <img src={url} alt="Receipt" className="max-h-[70vh] w-full rounded-lg border border-gray-200 object-contain dark:border-sage-800" />
      )}
    </Modal>
  )
}
