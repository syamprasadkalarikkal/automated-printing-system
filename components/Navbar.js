'use client'

export default function Navbar({
  screen,
  docs,
  readyDocs,
  isUploading,
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-green-600 text-sm font-black text-white">
            AS
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-black tracking-tight text-slate-950">Akshaya SmartPrint</h1>
            <p className="hidden text-xs font-medium text-slate-500 sm:block">Digital document print queue</p>
          </div>
        </div>
        <button
          type="button"
          onClick={screen === 'preview' ? onEdit : onCancel}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm sm:px-4"
        >
          {screen === 'preview' ? 'Edit' : 'Cancel'}
        </button>
        {screen !== 'success' && (
          <button
            type="button"
            onClick={screen === 'preview' ? onSubmit : onPreview}
            disabled={isUploading || isCounting}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-5"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </header>
  )
}
