'use client'

import { useEffect, useState } from 'react'
import { createSelectedPdfBlob, docTotals, paperDimensions, readableError } from '@/utils/printUtils'

export default function Preview({ docs, customerName, totalAmount, totalPages, isUploading, onBack, onSubmit }) {
  const displayName = customerName.trim() || 'Print order'

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">Preview before submit</p>
          <h3 className="text-2xl font-bold">{displayName}</h3>
        </div>
        {docs.length > 1 && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={isUploading}
            className="rounded-md bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isUploading ? 'Uploading...' : `Submit all ${docs.length} documents`}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {docs.map((doc, index) => {
          const totals = docTotals(doc)
          const dimensions = paperDimensions(doc.settings.paperSize, doc.settings.orientation)

          return (
            <div key={doc.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <PdfDocumentPreview doc={doc} title={`Document ${index + 1}`} />
                <div className="min-w-0">
                  <p className="text-sm font-bold">Document {index + 1}</p>
                  <p className="truncate text-sm text-slate-600">{doc.file.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {doc.settings.paperSize} {doc.settings.orientation} · {dimensions.width} x {dimensions.height} inch · {doc.settings.colorMode}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Pages {totals.label} · Copies {totals.copies} · Total print pages {totals.printPages}
                  </p>
                  <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-slate-500">Amount</p>
                    <p className="text-2xl font-black text-green-700">Rs.{totals.amount}</p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-green-900">Total pages</span>
          <span className="font-mono text-xl font-bold text-green-800">{totalPages}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-green-900">Amount to pay</span>
          <span className="font-mono text-3xl font-black text-green-700">Rs.{totalAmount}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm"
        >
          Edit details
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isUploading}
          className="rounded-md bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isUploading ? 'Uploading...' : 'Submit all documents'}
        </button>
      </div>
    </div>
  )
}

function PdfDocumentPreview({ doc, title }) {
  const [preview, setPreview] = useState({ url: '', error: '' })

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    async function buildPreview() {
      try {
        const selectedPdf = await createSelectedPdfBlob(doc)
        if (cancelled) return
        objectUrl = URL.createObjectURL(selectedPdf)
        setPreview({ url: objectUrl, error: '' })
      } catch (error) {
        if (cancelled) return
        setPreview({
          url: '',
          error: readableError(error, 'Could not create selected page preview.'),
        })
      }
    }

    buildPreview()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doc])

  if (preview.error) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-md border border-red-200 bg-red-50 px-4 text-center text-sm font-medium text-red-700">
        {preview.error}
      </div>
    )
  }

  if (!preview.url) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-md border border-slate-300 bg-white text-sm text-slate-500">
        Preparing selected pages...
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-300 bg-slate-200">
      <div className="border-b border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
        {title}
      </div>
      <object
        data={`${preview.url}#toolbar=0&navpanes=0&scrollbar=1`}
        type="application/pdf"
        className="h-[420px] w-full bg-white"
      >
        <iframe
          src={preview.url}
          title={title}
          className="h-[420px] w-full bg-white"
        />
      </object>
    </div>
  )
}
