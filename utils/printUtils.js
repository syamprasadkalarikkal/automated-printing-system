import { PDFDocument } from 'pdf-lib'

export const MAX_FILE_SIZE = 25 * 1024 * 1024
export const MAX_DOCUMENTS = 3

export const PRICE_PER_PAGE = {
  'Black & White': 10,
  Color: 20,
}

export const PAPER_SIZES = {
  A4: { width: 8.27, height: 11.69 },
  A3: { width: 11.69, height: 16.54 },
  Letter: { width: 8.5, height: 11 },
  Legal: { width: 8.5, height: 14 },
}

export const newDoc = () => ({
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

export const fmtSize = (bytes) => {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export const isPdf = (picked) =>
  picked?.type === 'application/pdf' || picked?.name?.toLowerCase().endsWith('.pdf')

export const formatCustomerToken = (queueNumber) => {
  const number = Number(queueNumber)
  if (!Number.isFinite(number) || number < 1) return 'C--'
  return `C${String(number).padStart(2, '0')}`
}

export const readableError = (error, fallback) => {
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

export const paperDimensions = (paperSize, orientation) => {
  const paper = PAPER_SIZES[paperSize] || PAPER_SIZES.A4
  if (orientation === 'Landscape') return { width: paper.height, height: paper.width }
  return paper
}

export const parseSelectedPages = (doc) => {
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

export const docTotals = (doc) => {
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

export const createSelectedPdfBlob = async (doc) => {
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
