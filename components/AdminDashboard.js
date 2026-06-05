'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
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

const TIME = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: IST_TIME_ZONE,
})

const COMPLETED_QUEUE_RETENTION_MS = 5 * 60 * 1000

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

const startOfToday = () => {
  const key = dateKey(new Date())
  return new Date(`${key}T00:00:00+05:30`)
}

const numberValue = (value) => Number(value) || 0

const statusLabel = (job) => {
  if (job.status === 'completed') return 'Completed'
  if (job.status === 'printing') return 'Printing'
  return 'Pending'
}

const removalTime = (job) => {
  if (job.status !== 'completed' || !job.completed_at) return ''
  return TIME.format(new Date(new Date(job.completed_at).getTime() + COMPLETED_QUEUE_RETENTION_MS))
}

const csvCell = (value) => {
  const text = String(value ?? '')
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

const csvDateLabel = (reportDate) => {
  return reportDateLabel(reportDate, '')
}

const csvText = (headers, rows) =>
  [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')

const downloadCsvFile = (filename, csv) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const dayCsvRow = (day) => [
  reportDateKey(day.report_date) || day.report_date,
  csvDateLabel(day.report_date),
  numberValue(day.black_and_white_prints),
  numberValue(day.color_prints),
  numberValue(day.total_prints),
  numberValue(day.total_earnings),
]

const dayCsvHeaders = ['Date', 'Day', 'Black & White Prints', 'Color Prints', 'Total Prints', 'Total Earnings']

export default function AdminDashboard() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [shopAccess, setShopAccess] = useState(null)
  const [shopAccessError, setShopAccessError] = useState('')
  const [isLoadingShopAccess, setIsLoadingShopAccess] = useState(false)
  const [showPasswordLogin, setShowPasswordLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [jobs, setJobs] = useState([])
  const [completedJobs, setCompletedJobs] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [actionJobId, setActionJobId] = useState('')
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
      setJobs([])
      setCompletedJobs([])
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
        setJobs([])
        setCompletedJobs([])
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

  const loadDashboardData = useCallback(async (showLoading = true) => {
    if (!session || !supabase || !activeShopId) return

    if (showLoading) setIsLoading(true)
    setDataError('')

    try {
      const completedQueueCutoff = new Date(Date.now() - COMPLETED_QUEUE_RETENTION_MS).toISOString()

      const [queueResult, archiveResult] = await Promise.all([
        supabase
          .from('print_jobs')
          .select('*')
          .eq('shop_id', activeShopId)
          .or(`status.is.null,status.neq.completed,completed_at.gte.${completedQueueCutoff}`)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('shop_completed_print_jobs')
          .select('*')
          .eq('shop_id', activeShopId)
          .order('report_date', { ascending: false })
          .limit(1000),
      ])

      if (queueResult.error) throw queueResult.error
      if (archiveResult.error) throw archiveResult.error

      setJobs(queueResult.data || [])
      setCompletedJobs(archiveResult.data || [])
    } catch (error) {
      setDataError(readableError(error, 'Could not load dashboard data. Run the updated Supabase dashboard SQL, then refresh.'))
      setJobs([])
      setCompletedJobs([])
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [activeShopId, session])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadDashboardData()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [loadDashboardData])

  useEffect(() => {
    if (!session || !activeShopId) return undefined

    const interval = window.setInterval(() => {
      loadDashboardData(false)
    }, 60 * 1000)

    return () => window.clearInterval(interval)
  }, [activeShopId, loadDashboardData, session])

  const metrics = useMemo(() => {
    const todayStart = startOfToday()
    const todayKey = dateKey(todayStart)
    const todaySummary = completedJobs.find((row) => reportDateKey(row.report_date) === todayKey)

    return {
      todayRevenue: numberValue(todaySummary?.total_earnings),
      todayPrints: numberValue(todaySummary?.total_prints),
      colorPrints: numberValue(todaySummary?.color_prints),
      bwPrints: numberValue(todaySummary?.black_and_white_prints),
    }
  }, [completedJobs])

  const queueJobs = useMemo(() => jobs, [jobs])

  const signInWithPassword = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    setIsSigningIn(true)

    try {
      if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not configured.')

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) setAuthError(readableError(error, 'Could not sign in. Check the admin email and password.'))
      else {
        setSession(data.session)
        setAuthMessage('Signed in successfully.')
      }
    } catch (error) {
      setAuthError(readableError(error, 'Could not sign in. Check the admin email and password.'))
    } finally {
      setIsSigningIn(false)
    }
  }

  const markFileDeleted = async (job, storageDeletedAt) => {
    if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not configured.')
    if (!activeShopId) throw new Error('This admin email is not assigned to a shop.')

    const { error } = await supabase
      .from('print_jobs')
      .update({ storage_deleted_at: storageDeletedAt })
      .eq('id', job.id)
      .eq('shop_id', activeShopId)

    if (error) throw error
  }

  const deleteStoredFile = async (job) => {
    if (!supabase) throw new Error(supabaseConfigError || 'Supabase is not configured.')
    if (!job.file_path || job.storage_deleted_at) return ''

    const { error } = await supabase.storage
      .from('print-queue')
      .remove([job.file_path])

    if (error) throw error

    const storageDeletedAt = new Date().toISOString()
    await markFileDeleted(job, storageDeletedAt)
    return storageDeletedAt
  }

  const completeJob = async (job) => {
    if (!job?.id || actionJobId) return

    setActionJobId(job.id)
    setDataError('')

    try {
      const { data, error } = await supabase
        .rpc('complete_print_job_for_shop', {
          p_job_id: job.id,
          p_shop_id: activeShopId,
        })
        .single()

      if (error) throw error

      const completedJob = data || {
        ...job,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }
      await deleteStoredFile(completedJob)

      await loadDashboardData(false)

      window.setTimeout(() => {
        loadDashboardData(false)
      }, COMPLETED_QUEUE_RETENTION_MS + 1000)
    } catch (error) {
      await loadDashboardData(false)
      setDataError(readableError(error, 'Could not complete this print job.'))
    } finally {
      setActionJobId('')
    }
  }

  const retryFileDelete = async (job) => {
    if (!job?.id || actionJobId) return

    setActionJobId(job.id)
    setDataError('')

    try {
      await deleteStoredFile(job)
      await loadDashboardData(false)
    } catch (error) {
      setDataError(readableError(error, 'Could not delete the stored print file.'))
    } finally {
      setActionJobId('')
    }
  }

  const downloadDayWiseCsv = () => {
    const rows = completedJobs.map(dayCsvRow)
    const csv = csvText(dayCsvHeaders, rows)

    downloadCsvFile(`printq-day-wise-earnings-${dateKey(new Date())}.csv`, csv)
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    setShopAccess(null)
    setShopAccessError('')
    setJobs([])
    setCompletedJobs([])
  }

  if (!authReady) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 text-slate-950">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">Loading admin dashboard...</p>
        </div>
      </main>
    )
  }

  if (supabaseConfigError) {
    return (
      <AdminSetupError message={supabaseConfigError} />
    )
  }

  if (!session) {
    return (
      <main className="min-h-dvh bg-slate-50 text-slate-950">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Image
              src="/logo/printq-logo.svg"
              alt="PrintQ"
              width={156}
              height={40}
              priority
              className="h-10 w-[156px] shrink-0 object-contain"
            />
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              Owner access
            </span>
          </div>
        </header>

        <section className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl items-center gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1.1fr)_420px]">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Secure dashboard</p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-slate-950 sm:text-5xl">
              Track daily print jobs, pages, and revenue.
            </h2>
        

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <LoginStat label="Access" value="Password" />
              <LoginStat label="Scope" value="Admin only" />
              <LoginStat label="Report" value="Monthly CSV" />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
            <div className="border-b border-slate-200 pb-5">
              <p className="text-sm font-bold text-slate-500">Authentication</p>
              <h2 className="mt-1 text-2xl font-black">Sign in to admin</h2>
            </div>

            {showPasswordLogin ? (
              <form onSubmit={signInWithPassword} className="pt-5">
                <label className="block text-sm font-bold text-slate-900">
                  Admin email
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="form-input mt-2"
                    placeholder="owner@example.com"
                  />
                </label>
                <label className="mt-4 block text-sm font-bold text-slate-900">
                  Password
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="form-input mt-2"
                    placeholder="Enter admin password"
                  />
                </label>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Use an admin account that already exists in Supabase Auth.
                </p>

                {authError && (
                  <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                    {authError}
                  </div>
                )}
                {authMessage && (
                  <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                    {authMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSigningIn}
                  className="mt-5 w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isSigningIn ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowPasswordLogin(true)}
                className="mt-5 w-full rounded-md bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
              >
                Login using password
              </button>
            )}
          </div>
        </section>
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
      <AdminSetupError message={shopAccessError} onSignOut={signOut} />
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
          <div className="flex items-center gap-2">
            <span className="hidden rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 sm:inline-flex">
              Shop {activeShopId}
            </span>
            <Link
              href="/admin/monthly-reports"
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
                <path d="M3 3v18h18" />
                <path d="M7 14l3-3 3 2 5-6" />
              </svg>
              Monthly reports
            </Link>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        {dataError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {dataError}
          </div>
        )}
        {!dataError && !isLoading && !queueJobs.length && !completedJobs.length && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            No print jobs are visible yet. Submit one customer print order, and make sure the Supabase dashboard SQL has been run.
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Today's earnings" value={MONEY.format(metrics.todayRevenue)} tone="green" />
          <MetricCard label="Total prints today" value={metrics.todayPrints} />
          <MetricCard label="Black & White prints" value={metrics.bwPrints} />
          <MetricCard label="Color prints" value={metrics.colorPrints} />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-black">Today mode</h2>
            <div className="mt-4 space-y-3">
              <ModeBar label="Black & White" value={metrics.bwPrints} total={metrics.todayPrints} />
              <ModeBar label="Color" value={metrics.colorPrints} total={metrics.todayPrints} />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
            <p className="text-sm font-semibold text-slate-300">Monthly reports</p>
            <p className="mt-2 text-2xl font-black">CSV files</p>
            <Link
              href="/admin/monthly-reports"
              className="mt-4 inline-flex rounded-md bg-white px-3 py-2 text-xs font-black text-slate-950 shadow-sm hover:bg-slate-100"
            >
              Open monthly reports
            </Link>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-lg font-black">Print queue</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Pages</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queueJobs.slice(0, 20).map((job) => (
                  <tr key={job.id || `${job.created_at}-${job.original_file_name}`} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{TIME.format(new Date(job.created_at))}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold">{job.customer_token || job.queue_number || '-'}</td>
                    <td className="px-4 py-3">{job.customer_name || 'Walk-in customer'}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-slate-600">{job.original_file_name || '-'}</td>
                    <td className="px-4 py-3">{job.color_mode || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[118px] flex-col gap-1">
                        <span className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-black ${
                          job.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : job.status === 'printing'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}>
                          {statusLabel(job)}
                        </span>
                        {job.status === 'completed' && removalTime(job) && (
                          <span className="text-xs font-semibold text-slate-500">Queue clears {removalTime(job)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{numberValue(job.total_print_pages)}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
                      {MONEY.format(numberValue(job.total_amount))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {job.status === 'completed' ? (
                        job.file_path && !job.storage_deleted_at ? (
                          <button
                            type="button"
                            onClick={() => retryFileDelete(job)}
                            disabled={actionJobId === job.id}
                            className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {actionJobId === job.id ? 'Deleting...' : 'Delete file'}
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Done</span>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => completeJob(job)}
                          disabled={actionJobId === job.id}
                          className="rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {actionJobId === job.id ? 'Saving...' : 'Completed'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!queueJobs.length && (
                  <tr>
                    <td colSpan="9" className="px-4 py-10 text-center text-sm text-slate-500">
                      No print jobs in queue.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-lg font-black">Day-wise earnings</h2>
              <p className="mt-1 text-sm text-slate-500">Daily totals for every completed print day.</p>
            </div>
            <button
              type="button"
              onClick={downloadDayWiseCsv}
              disabled={!completedJobs.length}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
              Download day-wise CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3 text-right">Black & White</th>
                  <th className="px-4 py-3 text-right">Color</th>
                  <th className="px-4 py-3 text-right">Total prints</th>
                  <th className="px-4 py-3 text-right">Total earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {completedJobs.map((day) => (
                  <tr key={day.id || day.report_date} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">
                      {reportDateLabel(day.report_date)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{numberValue(day.black_and_white_prints)}</td>
                    <td className="px-4 py-3 text-right font-mono">{numberValue(day.color_prints)}</td>
                    <td className="px-4 py-3 text-right font-mono">{numberValue(day.total_prints)}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
                      {MONEY.format(numberValue(day.total_earnings))}
                    </td>
                  </tr>
                ))}
                {!completedJobs.length && (
                  <tr>
                    <td colSpan="5" className="px-4 py-10 text-center text-sm text-slate-500">
                      No completed day totals yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function AdminSetupError({ message, onSignOut }) {
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
        <h1 className="mt-5 text-2xl font-black">Admin setup needed</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {message} {onSignOut
            ? 'Ask the developer to update shop_users, then sign in again.'
            : 'Add the required Supabase environment variables before using the dashboard.'}
        </p>
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
          >
            Sign out
          </button>
        )}
      </div>
    </main>
  )
}

function LoginStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
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

function ModeBar({ label, value, total }) {
  const percent = total ? Math.round((value / total) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-mono font-bold">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-slate-100">
        <div className="h-full rounded bg-emerald-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
