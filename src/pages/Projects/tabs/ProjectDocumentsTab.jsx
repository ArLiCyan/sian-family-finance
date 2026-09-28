import { useEffect, useState, useCallback } from 'react'
import { FileText, Image as ImageIcon, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Card, { CardHeader } from '../../../components/ui/Card'
import FileUploader from '../../../components/ui/FileUploader'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingState from '../../../components/ui/LoadingState'
import { formatDateShort } from '../../../lib/format'

export default function ProjectDocumentsTab({ project }) {
  const { profile, family } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .eq('entity_type', 'project')
      .eq('entity_id', project.id)
      .order('created_at', { ascending: false })
    setFiles(data ?? [])
    setLoading(false)
  }, [project.id])

  useEffect(() => {
    load()
  }, [load])

  async function openFile(path) {
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function remove(id) {
    await supabase.from('attachments').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="mb-4">
        <FileUploader
          folder={`family/${family.id}`}
          entityType="project"
          entityId={project.id}
          label="Upload Receipt / Document / Photo"
          onUploaded={load}
        />
      </div>
      <Card>
        <CardHeader title="Documents" subtitle="Receipts, invoices, quotations, and photos for this project" />
        {loading ? (
          <LoadingState />
        ) : files.length === 0 ? (
          <EmptyState title="No documents uploaded" message="Upload receipts and photos related to this project." />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-sage-800">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between py-2.5">
                <button onClick={() => openFile(f.file_path)} className="flex items-center gap-3 text-left hover:opacity-80">
                  {f.mime_type.startsWith('image/') ? <ImageIcon className="h-5 w-5 text-gray-400" /> : <FileText className="h-5 w-5 text-gray-400" />}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{f.file_name}</p>
                    <p className="text-xs text-gray-400">{formatDateShort(f.created_at)} · {(f.size_bytes / 1024).toFixed(0)} KB</p>
                  </div>
                </button>
                {f.uploaded_by === profile.id && (
                  <button onClick={() => remove(f.id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
