'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PDFDocument } from 'pdf-lib'
import { supabase } from '@/lib/supabase'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const MAX_DOCUMENTS = 3
const PRICE_PER_PAGE = {
  'Black & White': 10,
  Color: 20,
}
const PAPER_SIZES = {
  A4: { width: 8.27, height: 11.69 },
  A3: { width: 11.69, height: 16.54 },
  Letter: { width: 8.5, height: 11 },
  Legal: { width: 8.5, height: 14 },
}

const newDoc = () => ({
  id: crypto.randomUUID(),
  file: null,
  pageCount: 0,
  status: 'empty',
  error: '',
  settings: {
    copies: 1,
    paperSize: 'A4',
    orientation: 'Portrait',
    colorMode: 'Black & White',
    twoSided: 'Single sided',
    pagesPerSide: '1',
    pageRange: 'All Pages',
    customPages: '',
    notes: '',
  },
})

const fmtSize = (bytes) => {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const isPdf = (picked) =>
  picked?.type === 'application/pdf' || picked?.name?.toLowerCase().endsWith('.pdf')

const formatCustomerToken = (queueNumber) => {
  const number = Number(queueNumber)
  if (!Number.isFinite(number) || number < 1) return 'C--'
  return `C${String(number).padStart(2, '0')}`
}

const readableError = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error

  const message =
    error.message ||
    error.error_description ||
    error.details ||
    error.hint ||
    fallback

  if (message?.includes('schema cache')) {
    return `${message}. Run supabase/print_queue_setup.sql in Supabase, then retry.`
  }

  return message || fallback
}

const paperDimensions = (paperSize, orientation) => {
  const paper = PAPER_SIZES[paperSize] || PAPER_SIZES.A4
  if (orientation === 'Landscape') return { width: paper.height, height: paper.width }
  return paper
}

const parseSelectedPages = (doc) => {
  const pageCount = doc.pageCount || 0
  const { pageRange, customPages } = doc.settings

  if (!doc.file) return { count: 0, label: 'No PDF', pages: [], error: '' }
  if (pageCount < 1) return { count: 0, label: 'No pages', pages: [], error: 'Page count is not ready.' }

  const allPages = Array.from({ length: pageCount }, (_, index) => index + 1)

  if (pageRange === 'All Pages') return { count: pageCount, label: `1-${pageCount}`, pages: allPages, error: '' }
  if (pageRange === 'Current Page') return { count: 1, label: '1', pages: [1], error: '' }

  const raw = customPages.trim()
  if (!raw) return { count: 0, label: '', pages: [], error: 'Enter pages like 1-3, 6.' }

  const pages = new Set()
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)

  for (const part of parts) {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/)
    if (!match) return { count: 0, label: raw, pages: [], error: `Invalid page range: ${part}` }

    const start = Number(match[1])
    const end = Number(match[2] || match[1])

    if (start < 1 || end < 1 || start > end) {
      return { count: 0, label: raw, pages: [], error: `Invalid page range: ${part}` }
    }

    if (end > pageCount) {
      return { count: 0, label: raw, pages: [], error: `This PDF has only ${pageCount} pages.` }
    }

    for (let page = start; page <= end; page += 1) pages.add(page)
  }

  return { count: pages.size, label: raw, pages: [...pages].sort((a, b) => a - b), error: '' }
}

const docTotals = (doc) => {
  const selected = parseSelectedPages(doc)
  const copies = Math.max(Number(doc.settings.copies) || 1, 1)
  const printPages = selected.count * copies
  const rate = PRICE_PER_PAGE[doc.settings.colorMode] || PRICE_PER_PAGE['Black & White']

  return {
    ...selected,
    copies,
    printPages,
    rate,
    amount: printPages * rate,
  }
}

const createSelectedPdfBlob = async (doc) => {
  const selected = parseSelectedPages(doc)
  if (selected.error) throw new Error(selected.error)

  const isFullDocument =
    selected.pages.length === doc.pageCount &&
    selected.pages.every((page, index) => page === index + 1)

  if (isFullDocument) return doc.file

  const sourcePdf = await PDFDocument.load(await doc.file.arrayBuffer(), { ignoreEncryption: true })
  const outputPdf = await PDFDocument.create()
  const copiedPages = await outputPdf.copyPages(
    sourcePdf,
    selected.pages.map((page) => page - 1)
  )

  copiedPages.forEach((page) => outputPdf.addPage(page))

  const bytes = await outputPdf.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

function UploadContent() {
  const searchParams = useSearchParams()
  const shopId =
    searchParams.get('shop') ||
    process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID ||
    'main-counter'

  const [customerName, setCustomerName] = useState('')
  const [docs, setDocs] = useState([newDoc()])
  const [screen, setScreen] = useState('form')
  const [isUploading, setIsUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [jobs, setJobs] = useState([])

  const readyDocs = docs.filter((doc) => doc.file)
  const orderTotals = useMemo(() => {
    const totals = readyDocs.map(docTotals)
    return {
      documents: totals.length,
      pages: totals.reduce((sum, total) => sum + total.printPages, 0),
      amount: totals.reduce((sum, total) => sum + total.amount, 0),
      hasError: readyDocs.some((doc) => docTotals(doc).error),
    }
  }, [readyDocs])

  const updateDoc = (id, updater) => {
    setDocs((current) =>
      current.map((doc) => (doc.id === id ? updater(doc) : doc))
    )
    setErrorMsg('')
  }

  const updateDocSetting = (id, name, value) => {
    updateDoc(id, (doc) => ({
      ...doc,
      settings: {
        ...doc.settings,
        [name]: value,
      },
    }))
  }

  const pickFile = async (id, picked) => {
    if (!picked) return

    if (!isPdf(picked)) {
      updateDoc(id, (doc) => ({
        ...doc,
        file: null,
        pageCount: 0,
        status: 'error',
        error: 'Upload a PDF file only.',
      }))
      return
    }

    if (picked.size > MAX_FILE_SIZE) {
      updateDoc(id, (doc) => ({
        ...doc,
        file: null,
        pageCount: 0,
        status: 'error',
        error: 'File too large. Maximum allowed size is 25 MB.',
      }))
      return
    }

    updateDoc(id, (doc) => ({
      ...doc,
      file: picked,
      pageCount: 0,
      status: 'counting',
      error: '',
    }))

    try {
      const bytes = await picked.arrayBuffer()
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
      updateDoc(id, (doc) => ({
        ...doc,
        file: picked,
        pageCount: pdf.getPageCount(),
        status: 'ready',
        error: '',
      }))
    } catch {
      updateDoc(id, (doc) => ({
        ...doc,
        file: null,
        pageCount: 0,
        status: 'error',
        error: 'Could not read this PDF. Please try another file.',
      }))
    }
  }

  const clearDoc = (id) => {
    updateDoc(id, (doc) => ({
      ...newDoc(),
      id: doc.id,
    }))
  }

  const addDocument = () => {
    if (docs.length >= MAX_DOCUMENTS) return
    setDocs((current) => [...current, newDoc()])
    setScreen('form')
    setErrorMsg('')
  }

  const removeDocument = (id) => {
    setDocs((current) => {
      if (current.length === 1) return [newDoc()]
      return current.filter((doc) => doc.id !== id)
    })
    setScreen('form')
    setErrorMsg('')
  }

  const validateOrder = () => {
    if (!customerName.trim()) return 'Please enter your name.'
    if (!readyDocs.length) return 'Please upload at least one PDF.'
    if (docs.some((doc) => doc.status === 'counting')) return 'Please wait until page counting is finished.'

    const invalidDoc = readyDocs.find((doc) => docTotals(doc).error)
    if (invalidDoc) return docTotals(invalidDoc).error

    return ''
  }

  const openPreview = () => {
    const validationError = validateOrder()
    if (validationError) {
      setErrorMsg(validationError)
      setScreen('form')
      return
    }
    setErrorMsg('')
    setScreen('preview')
  }

  const reset = () => {
    setCustomerName('')
    setDocs([newDoc()])
    setScreen('form')
    setIsUploading(false)
    setErrorMsg('')
    setJobs([])
  }

  const handleUpload = async () => {
    const validationError = validateOrder()
    if (validationError) {
      setErrorMsg(validationError)
      setScreen('form')
      return
    }

    setIsUploading(true)
    setErrorMsg('')

    const createdJobs = []
    const uploadedPaths = []
    const orderDocuments = []

    try {
      for (const [index, doc] of readyDocs.entries()) {
        const totals = docTotals(doc)
        const ext = doc.file.name.split('.').pop() || 'pdf'
        const fileName = `${shopId}/${crypto.randomUUID()}.${ext}`
        const printFile = await createSelectedPdfBlob(doc)

        const { error: storageError } = await supabase.storage
          .from('print-queue')
          .upload(fileName, printFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'application/pdf',
          })

        if (storageError) {
          throw new Error(`File upload failed: ${readableError(storageError, 'Supabase storage rejected the file.')}`)
        }

        uploadedPaths.push(fileName)

        orderDocuments.push({
          file_path: fileName,
          original_file_name: doc.file.name,
          file_size: printFile.size,
          file_type: 'application/pdf',
          page_count: totals.count,
          total_print_pages: totals.printPages,
          copies: totals.copies,
          paper_size: doc.settings.paperSize,
          orientation: doc.settings.orientation,
          color_mode: doc.settings.colorMode,
          two_sided: doc.settings.twoSided,
          pages_per_side: Number(doc.settings.pagesPerSide) || 1,
          page_range: totals.label,
          document_number: index + 1,
          order_document_count: readyDocs.length,
          price_per_page: totals.rate,
          total_amount: totals.amount,
          notes: [
            doc.settings.notes.trim(),
            `Document ${index + 1} of ${readyDocs.length}`,
            `Amount Rs.${totals.amount}`,
          ].filter(Boolean).join(' | '),
        })
      }

      const { data: savedJobs, error: dbError } = await supabase
        .rpc('create_print_order', {
          p_shop_id: shopId,
          p_customer_name: customerName.trim(),
          p_documents: orderDocuments,
        })

      if (dbError) {
        throw new Error(`Database save failed: ${readableError(dbError, 'Supabase could not save the print order.')}`)
      }

      for (const [index, job] of (savedJobs || []).entries()) {
        const fallback = orderDocuments[index] || {}
        createdJobs.push({
          fileName: job?.original_file_name || fallback.original_file_name,
          pages: job?.total_print_pages ?? fallback.total_print_pages,
          amount: job?.total_amount ?? fallback.total_amount,
          queueNumber: job?.queue_number ?? null,
          customerToken: job?.customer_token || formatCustomerToken(job?.queue_number),
        })
      }

      setJobs(createdJobs)
      setScreen('success')
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from('print-queue').remove(uploadedPaths)
      }
      setErrorMsg(readableError(error, 'Upload failed. Please check your connection and try again.'))
      setScreen('form')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
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
            onClick={screen === 'preview' ? () => setScreen('form') : reset}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm sm:px-4"
          >
            {screen === 'preview' ? 'Edit' : 'Cancel'}
          </button>
          {screen !== 'success' && (
            <button
              type="button"
              onClick={screen === 'preview' ? handleUpload : openPreview}
              disabled={isUploading || docs.some((doc) => doc.status === 'counting')}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 sm:px-5"
            >
              {isUploading
                ? 'Sending'
                : screen === 'preview'
                  ? readyDocs.length > 1
                    ? `Submit all ${readyDocs.length}`
                    : 'Submit'
                  : 'Preview'}
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-green-500 text-sm font-black text-white">
                AS
              </span>
              <div>
                <h2 className="text-xl font-black tracking-tight">Akshaya SmartPrint</h2>
                <p className="text-sm text-slate-300">Preview selected pages and submit all PDFs as one order.</p>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          {screen === 'success' ? (
            <SuccessPanel jobs={jobs} totalAmount={orderTotals.amount} onReset={reset} />
          ) : screen === 'preview' ? (
            <PreviewPanel
              docs={readyDocs}
              customerName={customerName}
              totalAmount={orderTotals.amount}
              totalPages={orderTotals.pages}
              isUploading={isUploading}
              onBack={() => setScreen('form')}
              onSubmit={handleUpload}
            />
          ) : (
            <div className="space-y-5 p-4 sm:p-5">
              <Field label="Name">
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  className="form-input"
                  placeholder="Customer name"
                />
              </Field>

              <div className="space-y-4">
                {docs.map((doc, index) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    index={index}
                    canRemove={docs.length > 1}
                    onPick={(picked) => pickFile(doc.id, picked)}
                    onClear={() => clearDoc(doc.id)}
                    onRemove={() => removeDocument(doc.id)}
                    onSettingChange={(name, value) => updateDocSetting(doc.id, name, value)}
                  />
                ))}
              </div>

              {readyDocs.length > 1 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-green-950">Multiple documents ready</p>
                      <p className="text-sm text-green-800">
                        {readyDocs.length} PDFs will be submitted together under one customer token.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={addDocument}
                  disabled={docs.length >= MAX_DOCUMENTS}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  + Add another PDF
                </button>
                <OrderTotal pages={orderTotals.pages} amount={orderTotals.amount} />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function DocumentCard({ doc, index, canRemove, onPick, onClear, onRemove, onSettingChange }) {
  const totals = docTotals(doc)
  const dimensions = paperDimensions(doc.settings.paperSize, doc.settings.orientation)
  const isReady = doc.file && doc.status === 'ready'

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">Document {index + 1}</p>
          <p className="text-xs text-slate-500">Each PDF can have separate print settings.</p>
        </div>
        <div className="flex gap-2">
          {doc.file && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Change
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <label className="mt-3 flex min-h-24 cursor-pointer flex-col justify-center rounded-md border-2 border-dashed border-slate-300 bg-white px-4 py-4 text-sm hover:border-green-500 hover:bg-green-50">
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(event) => onPick(event.target.files?.[0])}
        />
        {doc.file ? (
          <>
            <span className="truncate font-semibold text-slate-900">{doc.file.name}</span>
            <span className="mt-1 text-xs text-slate-500">
              {fmtSize(doc.file.size)} · {doc.status === 'counting' ? 'Counting pages...' : `${doc.pageCount} pages`}
            </span>
          </>
        ) : (
          <>
            <span className="font-semibold text-slate-900">+ Select PDF</span>
            <span className="mt-1 text-xs text-slate-500">PDF only, maximum 25 MB</span>
          </>
        )}
      </label>

      {doc.error && <p className="mt-2 text-sm font-medium text-red-600">{doc.error}</p>}

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_220px]">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paper size">
            <select
              value={doc.settings.paperSize}
              onChange={(event) => onSettingChange('paperSize', event.target.value)}
              className="form-input"
            >
              <option>A4</option>
              <option>A3</option>
              <option>Letter</option>
              <option>Legal</option>
            </select>
          </Field>
          <Field label="Orientation">
            <select
              value={doc.settings.orientation}
              onChange={(event) => onSettingChange('orientation', event.target.value)}
              className="form-input"
            >
              <option>Portrait</option>
              <option>Landscape</option>
            </select>
          </Field>
          <Field label="Color">
            <select
              value={doc.settings.colorMode}
              onChange={(event) => onSettingChange('colorMode', event.target.value)}
              className="form-input"
            >
              <option>Black &amp; White</option>
              <option>Color</option>
            </select>
          </Field>
          <Field label="Copies">
            <input
              type="number"
              min="1"
              max="99"
              value={doc.settings.copies}
              onChange={(event) => onSettingChange('copies', event.target.value)}
              className="form-input"
            />
          </Field>
          <Field label="Two-sided">
            <select
              value={doc.settings.twoSided}
              onChange={(event) => onSettingChange('twoSided', event.target.value)}
              className="form-input"
            >
              <option>Single sided</option>
              <option>Two sided long edge</option>
              <option>Two sided short edge</option>
            </select>
          </Field>
          <Field label="Pages side">
            <select
              value={doc.settings.pagesPerSide}
              onChange={(event) => onSettingChange('pagesPerSide', event.target.value)}
              className="form-input"
            >
              <option>1</option>
              <option>2</option>
              <option>4</option>
            </select>
          </Field>
        </div>

        <PaperPreview dimensions={dimensions} pageNumber={doc.pageCount || index + 1} />
      </div>

      <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
        <p className="mb-2 text-sm font-bold">Pages to print</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr]">
          <Radio
            label="All Pages"
            checked={doc.settings.pageRange === 'All Pages'}
            onChange={() => onSettingChange('pageRange', 'All Pages')}
          />
          <Radio
            label="Current Page"
            checked={doc.settings.pageRange === 'Current Page'}
            onChange={() => onSettingChange('pageRange', 'Current Page')}
          />
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={doc.settings.pageRange === 'Custom'}
              onChange={() => onSettingChange('pageRange', 'Custom')}
              className="accent-green-600"
            />
            <span className="text-sm">Pages</span>
            <input
              value={doc.settings.customPages}
              onChange={(event) => onSettingChange('customPages', event.target.value)}
              disabled={doc.settings.pageRange !== 'Custom'}
              className="form-input min-w-0 disabled:bg-slate-100"
              placeholder="1-3, 6"
            />
          </label>
        </div>
        {totals.error && <p className="mt-2 text-sm font-medium text-red-600">{totals.error}</p>}
      </div>

      <Field label="Notes">
        <input
          value={doc.settings.notes}
          onChange={(event) => onSettingChange('notes', event.target.value)}
          className="form-input"
          placeholder="Optional instruction"
        />
      </Field>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <SummaryStat label="Pages" value={isReady ? totals.printPages : '-'} />
        <SummaryStat label="Rate" value={`Rs.${totals.rate}`} />
        <SummaryStat label="Amount" value={isReady ? `Rs.${totals.amount}` : '-'} />
      </div>
    </article>
  )
}

function PreviewPanel({ docs, customerName, totalAmount, totalPages, isUploading, onBack, onSubmit }) {
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">Preview before submit</p>
          <h3 className="text-2xl font-bold">{customerName}</h3>
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

function SuccessPanel({ jobs, totalAmount, onReset }) {
  const mainToken = jobs[0]?.customerToken || 'C--'

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-600 bg-green-50 text-2xl font-bold text-green-700">
        ✓
      </div>
      <div>
        <h2 className="text-2xl font-bold">Print job received</h2>
        <p className="mt-1 text-sm text-slate-500">Your PDF files are saved and waiting at the counter.</p>
      </div>
      <div className="w-full rounded-lg border-2 border-green-600 bg-green-50 px-5 py-5">
        <p className="text-xs font-bold uppercase tracking-widest text-green-800">Remember this token</p>
        <p className="mt-1 font-mono text-6xl font-black leading-none text-green-700">{mainToken}</p>
        <p className="mt-2 text-sm font-semibold text-green-900">
          Tell this number at the Akshaya center counter.
        </p>
      </div>
      <div className="w-full divide-y divide-green-200 border border-green-200 bg-green-50 text-left">
        {jobs.map((job, index) => (
          <div key={`${job.customerToken}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{job.fileName}</p>
              <p className="text-xs text-slate-500">
                Token {job.customerToken} · {job.pages} pages
              </p>
            </div>
            <p className="font-mono text-lg font-bold text-green-700">Rs.{job.amount}</p>
          </div>
        ))}
      </div>
      <div className="w-full rounded-md bg-slate-900 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Total amount</span>
          <span className="font-mono text-2xl font-black">Rs.{totalAmount}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm"
      >
        Upload another order
      </button>
    </div>
  )
}

function PaperPreview({ dimensions, pageNumber }) {
  return (
    <div className="rounded-md border border-slate-300 bg-white p-4">
      <div className="flex items-end justify-center gap-3">
        <span className="pb-8 text-xs text-slate-600">{dimensions.height} inch</span>
        <div
          className="flex items-center justify-center border-2 border-slate-700 bg-white text-4xl text-slate-800"
          style={{
            width: dimensions.width > dimensions.height ? '8rem' : '5.6rem',
            height: dimensions.width > dimensions.height ? '5.6rem' : '8rem',
          }}
        >
          {pageNumber}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-slate-600">{dimensions.width} inch</p>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-sm sm:grid-cols-[110px_1fr] sm:items-center">
      <span className="font-medium text-slate-900">{label}:</span>
      {children}
    </label>
  )
}

function Radio({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="radio" checked={checked} onChange={onChange} className="accent-green-600" />
      <span>{label}</span>
    </label>
  )
}

function SummaryStat({ label, value }) {
  return (
    <div className="rounded border border-slate-300 bg-white px-2 py-2">
      <p className="font-mono text-lg font-bold text-slate-900">{value}</p>
      <p className="text-slate-500">{label}</p>
    </div>
  )
}

function OrderTotal({ pages, amount }) {
  return (
    <div className="rounded-md bg-slate-900 px-4 py-3 text-white">
      <p className="text-xs font-semibold uppercase text-slate-300">Total</p>
      <p className="font-mono text-xl font-black">
        {pages} pages · Rs.{amount}
      </p>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm">Loading print form...</div>}>
      <UploadContent />
    </Suspense>
  )
}
