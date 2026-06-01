'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PDFDocument } from 'pdf-lib'
import Home from '@/components/Home'
import PreviewPanel from '@/components/Preview'
import PrintNavbar from '@/components/Navbar'
import SuccessPanel from '@/components/SuccessPanel'
import { supabase, supabaseConfigError } from '@/lib/supabase'
import {
  MAX_FILE_SIZE,
  PRINT_LAYOUTS,
  createSelectedPdfBlob,
  docTotals,
  fileKind,
  formatCustomerToken,
  isPrintableFile,
  newDoc,
  readableError,
} from '@/utils/printUtils'

const formatAccessTime = (seconds) => {
  const safeSeconds = Math.max(Number(seconds) || 0, 0)
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = String(safeSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

function UploadContent() {
  const searchParams = useSearchParams()
  const shopId =
    searchParams.get('shop') ||
    process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID ||
    'main-counter'
  const desktopId = searchParams.get('desktop') || ''
  const qrExpires = searchParams.get('qr_expires') || ''
  const qrNonce = searchParams.get('qr_nonce') || ''
  const qrSignature = searchParams.get('qr_sig') || ''

  const [customerName, setCustomerName] = useState('')
  const [docs, setDocs] = useState([newDoc()])
  const [screen, setScreen] = useState('form')
  const [isUploading, setIsUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [jobs, setJobs] = useState([])
  const [access, setAccess] = useState({
    status: 'checking',
    message: 'Checking QR access...',
    expires: 0,
    secondsRemaining: 0,
  })

  const readyDocs = docs.filter((doc) => doc.file)
  const hasQrAccess = access.status === 'valid'
  const canUpload = hasQrAccess && !supabaseConfigError
  const qrAccessQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set('shop', shopId)
    params.set('desktop', desktopId)
    params.set('qr_expires', qrExpires)
    params.set('qr_nonce', qrNonce)
    params.set('qr_sig', qrSignature)
    return params.toString()
  }, [shopId, desktopId, qrExpires, qrNonce, qrSignature])

  const verifyQrAccess = useCallback(async () => {
    if (!desktopId || !qrExpires || !qrNonce || !qrSignature) {
      setAccess({
        status: 'missing',
        message: 'Scan the latest QR code at the shop counter to open uploads.',
        expires: 0,
        secondsRemaining: 0,
      })
      return false
    }

    setAccess((current) => ({
      ...current,
      status: current.status === 'valid' ? 'valid' : 'checking',
      message: current.status === 'valid' ? current.message : 'Checking QR access...',
    }))

    try {
      const response = await fetch(`/api/qr-access/verify?${qrAccessQuery}`, {
        cache: 'no-store',
      })
      const result = await response.json()

      if (!response.ok || !result.ok) {
        setAccess({
          status: result.reason || 'invalid',
          message: result.message || 'This QR code is not valid. Please scan the latest QR at the counter.',
          expires: 0,
          secondsRemaining: 0,
        })
        return false
      }

      setAccess({
        status: 'valid',
        message: 'QR access active',
        expires: result.expires,
        secondsRemaining: result.secondsRemaining,
      })
      return true
    } catch {
      setAccess({
        status: 'invalid',
        message: 'Could not verify this QR code. Check your connection and scan again.',
        expires: 0,
        secondsRemaining: 0,
      })
      return false
    }
  }, [desktopId, qrAccessQuery, qrExpires, qrNonce, qrSignature])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      verifyQrAccess()
    }, 0)

    const interval = window.setInterval(() => {
      verifyQrAccess()
    }, 30 * 1000)

    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [verifyQrAccess])

  useEffect(() => {
    if (access.status !== 'valid' || !access.expires) return undefined

    const tick = () => {
      const secondsRemaining = access.expires - Math.floor(Date.now() / 1000)

      if (secondsRemaining < 0) {
        setAccess({
          status: 'expired',
          message: 'This QR has expired. Please scan the latest counter QR again.',
          expires: 0,
          secondsRemaining: 0,
        })
        setScreen('form')
        setErrorMsg('')
        return
      }

      setAccess((current) => ({
        ...current,
        secondsRemaining,
      }))
    }

    const timeout = window.setTimeout(tick, 0)
    const interval = window.setInterval(tick, 1000)

    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [access.expires, access.status])

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
        ...(name === 'printLayout' && value === PRINT_LAYOUTS.aadhaarRow
          ? {
              orientation: 'Landscape',
              twoSided: 'Single sided',
              pagesPerSide: '1',
            }
          : {}),
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
        ? {
            ...doc.settings,
            printLayout: PRINT_LAYOUTS.normal,
            pageRange: 'All Pages',
            customPages: '',
          }
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
        settings: {
          ...doc.settings,
          printLayout: PRINT_LAYOUTS.normal,
          pageRange: 'All Pages',
          customPages: '',
        },
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

  const ensureQrAccess = async () => {
    const isValid = await verifyQrAccess()

    if (!isValid) {
      setScreen('form')
      setErrorMsg('This QR has expired. Please scan the latest counter QR again.')
    }

    return isValid
  }

  const openPreview = async () => {
    if (!(await ensureQrAccess())) return

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
    if (!(await ensureQrAccess())) return

    if (!supabase) {
      setScreen('form')
      setErrorMsg(`Upload is not configured. ${supabaseConfigError}`)
      return
    }

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
        const customerLabel = customerName.trim() || 'Walk-in customer'

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
          shop_id: shopId,
          customer_name: customerLabel,
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
        .from('print_jobs')
        .insert(orderDocuments)
        .select('original_file_name,total_print_pages,total_amount,queue_number,customer_token')

      if (dbError) {
        throw new Error(`Database save failed: ${readableError(dbError, 'Supabase could not save the print job.')}`)
      }

      let fallbackToken = null
      
      for (const [index, job] of (savedJobs || []).entries()) {
        const fallback = orderDocuments[index] || {}
        let customerToken = job?.customer_token || formatCustomerToken(job?.queue_number)
        
        // If database didn't generate a token (e.g., no auto-increment sequence),
        // generate a unique one client-side for this order
        if (customerToken === 'C--') {
          if (!fallbackToken) {
            // Generate unique token only once per order
            const timestamp = Math.floor(Date.now() / 1000)
            const randomSuffix = Math.floor(Math.random() * 100)
            const uniqueNumber = ((timestamp % 10000) * 100 + randomSuffix) % 99 + 1
            fallbackToken = formatCustomerToken(uniqueNumber)
          }
          customerToken = fallbackToken
        }
        
        createdJobs.push({
          fileName: job?.original_file_name || fallback.original_file_name,
          pages: job?.total_print_pages ?? fallback.total_print_pages,
          amount: job?.total_amount ?? fallback.total_amount,
          queueNumber: job?.queue_number ?? null,
          customerToken: customerToken,
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
        accessLocked={!canUpload}
        onCancel={reset}
        onEdit={() => setScreen('form')}
        onPreview={openPreview}
        onSubmit={handleUpload}
      />

      <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
        {hasQrAccess && screen !== 'success' && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            QR access active for {formatAccessTime(access.secondsRemaining)}. Upload before this code expires.
          </div>
        )}
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {!hasQrAccess ? (
            <QrAccessPanel access={access} onRetry={verifyQrAccess} />
          ) : supabaseConfigError ? (
            <SetupErrorPanel message={supabaseConfigError} />
          ) : errorMsg && (
            <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          {canUpload && screen === 'success' ? (
            <SuccessPanel jobs={jobs} totalAmount={orderTotals.amount} onReset={reset} />
          ) : canUpload && screen === 'preview' ? (
            <PreviewPanel
              docs={readyDocs}
              customerName={customerName}
              totalAmount={orderTotals.amount}
              totalPages={orderTotals.pages}
              isUploading={isUploading}
              onBack={() => setScreen('form')}
              onSubmit={handleUpload}
            />
          ) : canUpload ? (
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
          ) : null}
        </section>
      </main>
    </div>
  )
}

function QrAccessPanel({ access, onRetry }) {
  const isChecking = access.status === 'checking'

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-5 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xl font-black text-slate-950">
        QR
      </div>
      <div>
        <h2 className="text-2xl font-black text-slate-950">Scan the counter QR</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {access.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={isChecking}
        className="rounded-md bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isChecking ? 'Checking...' : 'Try again'}
      </button>
      <p className="text-xs font-semibold text-slate-500">
        The shop QR refreshes regularly. Upload access lasts until the signed QR expiry.
      </p>
    </div>
  )
}

function SetupErrorPanel({ message }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-5 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-200 bg-red-50 text-xl font-black text-red-700">
        !
      </div>
      <div>
        <h2 className="text-2xl font-black text-slate-950">Upload setup needed</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {message} Add the required Supabase environment variables on the website server.
        </p>
      </div>
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
