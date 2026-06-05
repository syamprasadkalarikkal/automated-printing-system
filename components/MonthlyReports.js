'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { readableError } from '@/utils/printUtils'
import { supabase, supabaseConfigError } from '@/lib/supabase'
import { getShopAccessForSession } from '@/lib/shopAccess'

const IST_TIME_ZONE = 'Asia/Kolkata'
const MONEY = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
  style: 'currency',
  currency: 'INR',
})

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: IST_TIME_ZONE,
})

const MONTH = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
})

const numberValue = (value) => Number(value) || 0

const dateKey = (value) =>
  new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
  }).format(value)

const isReportDateKey = (key) => {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const reportDateKey = (value) => {
  if (!value) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : dateKey(value)

  const text = String(value)
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/)
  if (match) return isReportDateKey(match[1]) ? match[1] : ''

  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? '' : dateKey(date)
}

const reportDateValue = (value) => {
  const key = reportDateKey(value)
  if (!key) return null

  const date = new Date(`${key}T00:00:00+05:30`)
  return Number.isNaN(date.getTime()) ? null : date
}

const reportDateLabel = (value, fallback = 'Unknown day') => {
  const date = reportDateValue(value)
  return date ? DATE.format(date) : fallback
}

const monthKey = (reportDate) => reportDateKey(reportDate).slice(0, 7)

const monthLabel = (key) => {
  const date = reportDateValue(`${key}-01`)
  return date ? MONTH.format(date) : ''
}

const csvCell = (value) => {
  const text = String(value ?? '')
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

const csvText = (headers, rows) =>
  [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')

const downloadBlobFile = (filename, blob) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const downloadCsvFile = (filename, csv) => {
  downloadBlobFile(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }))
}

const csvDateLabel = (reportDate) => {
  return reportDateLabel(reportDate, '')
}

const dayCsvHeaders = ['Date', 'Day', 'Black & White Prints', 'Color Prints', 'Total Prints', 'Total Earnings']

const dayCsvRow = (day) => [
  reportDateKey(day.report_date) || day.report_date,
  csvDateLabel(day.report_date),
  numberValue(day.black_and_white_prints),
  numberValue(day.color_prints),
  numberValue(day.total_prints),
  numberValue(day.total_earnings),
]

const daysInMonth = (key, rowsByDate) => {
  const [year, month] = key.split('-').map(Number)
  const count = new Date(year, month, 0).getDate()

  return Array.from({ length: count }, (_, index) => {
    const reportDate = `${key}-${String(index + 1).padStart(2, '0')}`
    return rowsByDate.get(reportDate) || {
      report_date: reportDate,
      black_and_white_prints: 0,
      color_prints: 0,
      total_prints: 0,
      total_earnings: 0,
    }
  })
}

const drawText = (page, text, options) => {
  page.drawText(String(text ?? ''), options)
}

const createMonthlyPdfBlob = async (month) => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  const left = 36
  const rowHeight = 18
  const headerFill = rgb(0.94, 0.96, 0.98)
  const border = rgb(0.82, 0.86, 0.9)
  const ink = rgb(0.06, 0.09, 0.16)
  const muted = rgb(0.38, 0.45, 0.55)
  const green = rgb(0.04, 0.48, 0.31)
  const columns = [
    { label: 'Date', x: left, width: 118, align: 'left' },
    { label: 'Black & White', x: left + 118, width: 96, align: 'right' },
    { label: 'Color', x: left + 214, width: 76, align: 'right' },
    { label: 'Total prints', x: left + 290, width: 92, align: 'right' },
    { label: 'Earnings', x: left + 382, width: 130, align: 'right' },
  ]

  let y = height - 46

  page.drawText('PrintQ Monthly Earnings Report', {
    x: left,
    y,
    size: 18,
    font: bold,
    color: ink,
  })

  y -= 22
  page.drawText(month.label, {
    x: left,
    y,
    size: 11,
    font,
    color: muted,
  })

  y -= 30
  page.drawText(`Month earnings: Rs.${month.totalEarnings}`, {
    x: left,
    y,
    size: 12,
    font: bold,
    color: green,
  })
  page.drawText(`Total prints: ${month.totalPrints}`, {
    x: left + 220,
    y,
    size: 12,
    font: bold,
    color: ink,
  })

  y -= 28
  page.drawRectangle({
    x: left,
    y: y - 5,
    width: width - left * 2,
    height: rowHeight,
    color: headerFill,
    borderColor: border,
    borderWidth: 1,
  })

  columns.forEach((column) => {
    const labelWidth = bold.widthOfTextAtSize(column.label, 9)
    drawText(page, column.label, {
      x: column.align === 'right' ? column.x + column.width - labelWidth - 6 : column.x + 6,
      y,
      size: 9,
      font: bold,
      color: ink,
    })
  })

  y -= rowHeight

  const rows = month.days.map((day) => ({
    date: `${day.report_date} (${csvDateLabel(day.report_date)})`,
    bw: numberValue(day.black_and_white_prints),
    color: numberValue(day.color_prints),
    prints: numberValue(day.total_prints),
    earnings: `Rs.${numberValue(day.total_earnings)}`,
  }))

  rows.push({
    date: 'Month Total',
    bw: month.bwPrints,
    color: month.colorPrints,
    prints: month.totalPrints,
    earnings: `Rs.${month.totalEarnings}`,
    total: true,
  })

  rows.forEach((row) => {
    const rowFont = row.total ? bold : font
    page.drawRectangle({
      x: left,
      y: y - 5,
      width: width - left * 2,
      height: rowHeight,
      borderColor: border,
      borderWidth: 0.5,
      color: row.total ? rgb(0.95, 0.99, 0.97) : undefined,
    })

    const values = [row.date, row.bw, row.color, row.prints, row.earnings]
    columns.forEach((column, index) => {
      const value = String(values[index])
      const valueWidth = rowFont.widthOfTextAtSize(value, 8.5)
      drawText(page, value, {
        x: column.align === 'right' ? column.x + column.width - valueWidth - 6 : column.x + 6,
        y,
        size: 8.5,
        font: rowFont,
        color: row.total && index === 4 ? green : ink,
      })
    })

    y -= rowHeight
  })

  const bytes = await pdf.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

export default function MonthlyReports() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [shopAccess, setShopAccess] = useState(null)
  const [shopAccessError, setShopAccessError] = useState('')
  const [isLoadingShopAccess, setIsLoadingShopAccess] = useState(false)
  const [completedDays, setCompletedDays] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const activeShopId = shopAccess?.shopId || ''

  useEffect(() => {
    let isMounted = true

    async function loadSession() {
      if (!supabase) {
        setAuthReady(true)
        return
      }

      const { data } = await supabase.auth.getSession()
      if (!isMounted) return
      setSession(data.session)
      setAuthReady(true)
    }

    loadSession()

    if (!supabase) return () => {
      isMounted = false
    }

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setShopAccess(null)
      setShopAccessError('')
      setCompletedDays([])
      setAuthReady(true)
    })

    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return undefined

    let isMounted = true

    async function loadShopAccess() {
      setIsLoadingShopAccess(true)
      setShopAccessError('')

      try {
        const nextShopAccess = await getShopAccessForSession(session)
        if (!isMounted) return
        setShopAccess(nextShopAccess)
      } catch (error) {
        if (!isMounted) return
        setShopAccess(null)
        setCompletedDays([])
        setShopAccessError(readableError(error, 'This admin email is not assigned to a shop.'))
      } finally {
        if (isMounted) setIsLoadingShopAccess(false)
      }
    }

    loadShopAccess()

    return () => {
      isMounted = false
    }
  }, [session])

  useEffect(() => {
    if (!session || !supabase || !activeShopId) return undefined

    const timeout = window.setTimeout(async () => {
      setIsLoading(true)
      setDataError('')

      const { data, error } = await supabase
        .from('shop_completed_print_jobs')
        .select('*')
        .eq('shop_id', activeShopId)
        .order('report_date', { ascending: false })
        .limit(1000)

      if (error) {
        setDataError(readableError(error, 'Could not load monthly reports.'))
        setCompletedDays([])
      } else {
        setCompletedDays(data || [])
      }

      setIsLoading(false)
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [activeShopId, session])

  const monthlyReports = useMemo(() => {
    const currentMonthKey = monthKey(dateKey(new Date()))
    const reports = new Map()

    for (const day of completedDays) {
      const reportDate = reportDateKey(day.report_date)
      const key = monthKey(reportDate)
      if (!key || key === currentMonthKey) continue

      const report = reports.get(key) || {
        key,
        label: monthLabel(key),
        rowsByDate: new Map(),
        totalPrints: 0,
        bwPrints: 0,
        colorPrints: 0,
        totalEarnings: 0,
      }

      report.rowsByDate.set(reportDate, { ...day, report_date: reportDate })
      report.totalPrints += numberValue(day.total_prints)
      report.bwPrints += numberValue(day.black_and_white_prints)
      report.colorPrints += numberValue(day.color_prints)
      report.totalEarnings += numberValue(day.total_earnings)
      reports.set(key, report)
    }

    return [...reports.values()]
      .map((report) => ({
        ...report,
        days: daysInMonth(report.key, report.rowsByDate),
      }))
      .toSorted((a, b) => b.key.localeCompare(a.key))
  }, [completedDays])

  const downloadMonthCsv = (month) => {
    const rows = [
      ...month.days.map(dayCsvRow),
      ['', `${month.label} Total`, month.bwPrints, month.colorPrints, month.totalPrints, month.totalEarnings],
    ]
    const csv = csvText(dayCsvHeaders, rows)

    downloadCsvFile(`printq-earnings-${month.key}.csv`, csv)
  }

  const downloadMonthPdf = async (month) => {
    const blob = await createMonthlyPdfBlob(month)
    downloadBlobFile(`printq-earnings-${month.key}.pdf`, blob)
  }

  if (!authReady) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 text-slate-950">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">Loading monthly reports...</p>
        </div>
      </main>
    )
  }

  if (supabaseConfigError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 text-slate-950">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <Image
            src="/logo/printq-logo.svg"
            alt="PrintQ"
            width={156}
            height={40}
            priority
            className="mx-auto h-10 w-[156px] object-contain"
          />
          <h1 className="mt-5 text-2xl font-black">Reports setup needed</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {supabaseConfigError} Add the required Supabase environment variables before using reports.
          </p>
        </div>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 text-slate-950">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Image
            src="/logo/printq-logo.svg"
            alt="PrintQ"
            width={156}
            height={40}
            priority
            className="mx-auto h-10 w-[156px] object-contain"
          />
          <h1 className="mt-5 text-2xl font-black">Monthly reports</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in from the admin dashboard to view CSV files.</p>
          <Link
            href="/admin"
            className="mt-5 inline-flex rounded-md bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
          >
            Go to admin
          </Link>
        </div>
      </main>
    )
  }

  if (isLoadingShopAccess) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 text-slate-950">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">Loading assigned shop...</p>
        </div>
      </main>
    )
  }

  if (shopAccessError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 text-slate-950">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <Image
            src="/logo/printq-logo.svg"
            alt="PrintQ"
            width={156}
            height={40}
            priority
            className="mx-auto h-10 w-[156px] object-contain"
          />
          <h1 className="mt-5 text-2xl font-black">Shop access needed</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{shopAccessError}</p>
          <Link
            href="/admin"
            className="mt-5 inline-flex rounded-md bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
          >
            Go to admin
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Image
            src="/logo/printq-logo.svg"
            alt="PrintQ"
            width={156}
            height={40}
            priority
            className="h-10 w-[156px] shrink-0 object-contain"
          />
          <Link
            href="/admin"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-black text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        {dataError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {dataError}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Completed months" value={monthlyReports.length} />
          <MetricCard
            label="Total earnings"
            value={MONEY.format(monthlyReports.reduce((total, month) => total + month.totalEarnings, 0))}
            tone="green"
          />
          <MetricCard
            label="Total prints"
            value={monthlyReports.reduce((total, month) => total + month.totalPrints, 0)}
          />
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h1 className="text-lg font-black">Monthly report files</h1>
              <p className="mt-1 text-sm text-slate-500">Each file includes every day in the month and the month total.</p>
            </div>
            {isLoading && <p className="text-sm font-semibold text-slate-500">Refreshing...</p>}
          </div>
          <div className="p-4">
            {monthlyReports.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {monthlyReports.map((month) => (
                  <article
                    key={month.key}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="mx-auto flex h-28 w-24 items-center justify-center rounded border border-slate-200 bg-slate-50">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 48 56"
                        className="h-20 w-16 text-slate-700"
                        fill="none"
                      >
                        <path
                          d="M10 3h20l8 8v42H10V3z"
                          fill="white"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path d="M30 3v10h8" stroke="currentColor" strokeWidth="2" />
                        <path d="M15 22h18M15 28h18M15 34h18M15 40h12" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </div>

                    <div className="mt-4 text-center">
                      <h2 className="truncate text-sm font-black text-slate-950">{month.label}</h2>
                      <p className="mt-1 truncate font-mono text-xs text-slate-500">printq-earnings-{month.key}</p>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <ReportStat label="B&W" value={month.bwPrints} />
                      <ReportStat label="Color" value={month.colorPrints} />
                      <ReportStat label="Prints" value={month.totalPrints} />
                      <ReportStat label="Earnings" value={MONEY.format(month.totalEarnings)} />
                    </dl>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => downloadMonthPdf(month)}
                        className="rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-slate-800"
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadMonthCsv(month)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50"
                      >
                        CSV
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                Monthly report files will appear after a month is complete.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function ReportStat({ label, value }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 truncate font-mono font-black text-slate-950">{value}</dd>
    </div>
  )
}

function MetricCard({ label, value, tone = 'slate' }) {
  const valueClass = tone === 'green' ? 'text-emerald-700' : 'text-slate-950'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${valueClass}`}>{value}</p>
    </div>
  )
}
