'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PDFDocument } from 'pdf-lib'
import Home from '@/components/Home'
import PreviewPanel from '@/components/Preview'
import PrintNavbar from '@/components/Navbar'
import SuccessPanel from '@/components/SuccessPanel'
import { supabase } from '@/lib/supabase'
import {
  MAX_FILE_SIZE,
  createSelectedPdfBlob,
  docTotals,
  fileKind,
  formatCustomerToken,
  isPrintableFile,
  newDoc,
  readableError,
} from '@/utils/printUtils'

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

    const pickedKind = fileKind(picked)

    if (!isPrintableFile(picked)) {
      updateDoc(id, (doc) => ({
        ...doc,
        file: null,
        fileKind: '',
        pageCount: 0,
        status: 'error',
        error: 'Upload a PDF or image file only.',
      }))
      return
    }

    if (picked.size > MAX_FILE_SIZE) {
      updateDoc(id, (doc) => ({
        ...doc,
        file: null,
        fileKind: '',
        pageCount: 0,
        status: 'error',
        error: 'File too large. Maximum allowed size is 25 MB.',
      }))
      return
    }

    updateDoc(id, (doc) => ({
      ...doc,
      file: picked,
      fileKind: pickedKind,
      pageCount: 0,
      status: pickedKind === 'pdf' ? 'counting' : 'ready',
      error: '',
      settings: pickedKind === 'image'
        ? { ...doc.settings, pageRange: 'All Pages', customPages: '' }
        : doc.settings,
    }))

    if (pickedKind === 'image') {
      updateDoc(id, (doc) => ({
        ...doc,
        file: picked,
        fileKind: pickedKind,
        pageCount: 1,
        status: 'ready',
        error: '',
        settings: { ...doc.settings, pageRange: 'All Pages', customPages: '' },
      }))
      return
    }

    try {
      const bytes = await picked.arrayBuffer()
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
      updateDoc(id, (doc) => ({
        ...doc,
        file: picked,
        fileKind: pickedKind,
        pageCount: pdf.getPageCount(),
        status: 'ready',
        error: '',
      }))
    } catch {
      updateDoc(id, (doc) => ({
        ...doc,
        file: null,
        fileKind: '',
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
    if (!readyDocs.length) return 'Please upload at least one PDF or image.'
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
        const fileName = `${shopId}/${crypto.randomUUID()}.pdf`
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
          p_customer_name: customerName.trim() || 'Walk-in customer',
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
      <PrintNavbar
        screen={screen}
        docs={docs}
        readyDocs={readyDocs}
        isUploading={isUploading}
        onCancel={reset}
        onEdit={() => setScreen('form')}
        onPreview={openPreview}
        onSubmit={handleUpload}
      />

      <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
            <Home
              customerName={customerName}
              setCustomerName={setCustomerName}
              docs={docs}
              readyDocs={readyDocs}
              orderTotals={orderTotals}
              onAddDocument={addDocument}
              onPickFile={pickFile}
              onClearDoc={clearDoc}
              onRemoveDoc={removeDocument}
              onSettingChange={updateDocSetting}
            />
          )}
        </section>
      </main>
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
