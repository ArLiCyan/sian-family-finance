import { Loader2 } from 'lucide-react'

export default function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin mb-2" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
