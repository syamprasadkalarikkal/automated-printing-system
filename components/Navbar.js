'use client'

import Image from 'next/image'

export default function Navbar({
  screen,
  docs,
  readyDocs,
  isUploading,
  accessLocked = false,
  onCancel,
  onEdit,
  onPreview,
  onSubmit,
}) {
  const isCounting = docs.some((doc) => doc.status === 'counting')
  const actionLabel = isUploading
    ? 'Sending'
    : screen === 'preview'
      ? readyDocs.length > 1
        ? `Submit all ${readyDocs.length}`
        : 'Submit'
      : 'Preview'

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Image
            src="/logo/printq-logo.svg"
            alt="PrintQ"
            width={156}
            height={40}
            priority
            className="h-10 w-[156px] shrink-0 object-contain"
          />
        </div>
        {screen !== 'success' && !accessLocked && (
          <button
            type="button"
            onClick={screen === 'preview' ? onEdit : onCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:px-4"
          >
            {screen === 'preview' ? 'Edit' : 'Cancel'}
          </button>
        )}
        {screen !== 'success' && !accessLocked && (
          <button
            type="button"
            onClick={screen === 'preview' ? onSubmit : onPreview}
            disabled={isUploading || isCounting}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-5"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </header>
  )
}
