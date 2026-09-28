import { useRef, useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

// Uploads into the shared "receipts" bucket under the path convention enforced
// by storage RLS: private/<profile_id>/... or family/<family_id>/...
export default function FileUploader({ folder, entityType, entityId, onUploaded, label = 'Upload File' }) {
  const { profile } = useAuth()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPG, PNG, WEBP, or PDF files are allowed.')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('File must be under 10MB.')
      return
    }

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${folder}/${crypto.randomUUID()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type })
    if (uploadErr) {
      setUploading(false)
      setError(uploadErr.message)
      return
    }

    const { error: attachErr } = await supabase.from('attachments').insert({
      entity_type: entityType,
      entity_id: entityId,
      file_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: profile.id,
    })

    setUploading(false)
    if (attachErr) {
      setError(attachErr.message)
      return
    }
    if (inputRef.current) inputRef.current.value = ''
    onUploaded?.()
  }

  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-sage-700 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-sage-800">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? 'Uploading…' : label}
        <input ref={inputRef} type="file" accept={ALLOWED_TYPES.join(',')} className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
