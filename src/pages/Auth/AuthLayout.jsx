import { Wallet } from 'lucide-react'

function FamilyPolaroid() {
  return (
    <div className="relative mx-auto mb-7 mt-1 w-full max-w-[380px]">
      <div className="absolute inset-0 translate-x-2 -translate-y-1 rotate-[2.5deg] rounded-xl bg-[#F6C6A0]" />
      <div className="relative rotate-[-1.5deg] rounded-lg bg-white p-3 pb-4 shadow-lg shadow-sage-900/10">
        <img
          src="/assets/sian-family-photo.jpg"
          alt="The SIAN Family"
          className="block w-full rounded-sm object-cover"
          style={{ aspectRatio: '2000 / 1037' }}
        />
        <p className="mt-3 text-center font-serif text-[15px] italic text-sage-800">
          The SIAN Family — an unbreakable bond
        </p>
      </div>
      <div className="absolute -top-2 left-1/2 h-5 w-16 -translate-x-1/2 -rotate-3 rounded-sm bg-[#F6C6A0]/80 shadow-sm" />
    </div>
  )
}

export default function AuthLayout({ title, subtitle, photo = false, children }) {
  return (
    <div className="relative min-h-screen bg-gray-50 dark:bg-sage-950">
      <div className="absolute inset-x-0 top-0 h-36 overflow-hidden bg-sage-100 dark:bg-sage-900/50" />
      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-600 text-white shadow-sm">
              <Wallet className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-sage-900 dark:text-gray-100">SIAN Family Finance</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Private family financial command center</p>
          </div>

          {photo && <FamilyPolaroid />}

          <div className="rounded-2xl border border-gray-200 bg-white dark:border-sage-800 dark:bg-sage-900 p-6 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            {subtitle && <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
