'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { readableError } from '@/utils/printUtils'
import { supabase } from '@/lib/supabase'

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

const dateKey = (value) =>
  new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
  }).format(value)

const startOfToday = () => {
  const key = dateKey(new Date())
  return new Date(`${key}T00:00:00+05:30`)
}

const startOfTomorrow = () => new Date(startOfToday().getTime() + 24 * 60 * 60 * 1000)

const numberValue = (value) => Number(value) || 0

const sum = (rows, key) => rows.reduce((total, row) => total + numberValue(row[key]), 0)

export default function AdminDashboard() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [jobs, setJobs] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [dataError, setDataError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadSession() {
      const { data } = await supabase.auth.getSession()
      if (!isMounted) return
      setSession(data.session)
      setAuthReady(true)
    }

    loadSession()

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })

    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return

    async function loadJobs() {
      setIsLoading(true)
      setDataError('')

      const since = new Date(startOfToday().getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('print_jobs')
        .select(
          'id,created_at,shop_id,customer_name,original_file_name,total_print_pages,total_amount,copies,color_mode,paper_size,queue_number,customer_token'
        )
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) {
        setDataError(readableError(error, 'Could not load dashboard data.'))
        setJobs([])
      } else {
        setJobs(data || [])
      }

      setIsLoading(false)
    }

    loadJobs()
  }, [session])

  const metrics = useMemo(() => {
    const todayStart = startOfToday()
    const tomorrowStart = startOfTomorrow()
    const todayRows = jobs.filter((job) => {
      const created = new Date(job.created_at)
      return created >= todayStart && created < tomorrowStart
    })

    const daily = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(todayStart.getTime() - (6 - index) * 24 * 60 * 60 * 1000)
      const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000)
      const rows = jobs.filter((job) => {
        const created = new Date(job.created_at)
        return created >= day && created < nextDay
      })

      return {
        label: DATE.format(day),
        jobs: rows.length,
        pages: sum(rows, 'total_print_pages'),
        revenue: sum(rows, 'total_amount'),
      }
    })

    const maxDailyRevenue = Math.max(...daily.map((day) => day.revenue), 1)
    const colorJobs = todayRows.filter((job) => job.color_mode === 'Color').length
    const bwJobs = todayRows.length - colorJobs

    return {
      todayRows,
      daily,
      maxDailyRevenue,
      todayRevenue: sum(todayRows, 'total_amount'),
      todayPages: sum(todayRows, 'total_print_pages'),
      todayJobs: todayRows.length,
      weekRevenue: sum(jobs, 'total_amount'),
      weekPages: sum(jobs, 'total_print_pages'),
      averageJob: todayRows.length ? Math.round(sum(todayRows, 'total_amount') / todayRows.length) : 0,
      colorJobs,
      bwJobs,
    }
  }, [jobs])

  const signInWithPassword = async (event) => {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    setIsSigningIn(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) setAuthError(readableError(error, 'Could not sign in. Check the admin email and password.'))
    else setAuthMessage('Signed in successfully.')

    setIsSigningIn(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setJobs([])
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
              <LoginStat label="Report" value="7 days" />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
            <div className="border-b border-slate-200 pb-5">
              <p className="text-sm font-bold text-slate-500">Authentication</p>
              <h2 className="mt-1 text-2xl font-black">Sign in to admin</h2>
            </div>

            <form onSubmit={signInWithPassword} className="pt-5">
              <label className="block text-sm font-bold text-slate-900">
                Admin email
                <input
                  type="email"
                  required
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
          </div>
        </section>
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
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        {dataError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {dataError}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Today's revenue" value={MONEY.format(metrics.todayRevenue)} tone="green" />
          <MetricCard label="Today's print jobs" value={metrics.todayJobs} />
          <MetricCard label="Today's pages" value={metrics.todayPages} />
          <MetricCard label="Average job" value={MONEY.format(metrics.averageJob)} />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black">Last 7 days</h2>
                <p className="text-sm text-slate-500">
                  {MONEY.format(metrics.weekRevenue)} from {metrics.weekPages} pages
                </p>
              </div>
              {isLoading && <p className="text-sm font-semibold text-slate-500">Refreshing...</p>}
            </div>
            <div className="mt-5 grid h-64 grid-cols-7 items-end gap-3">
              {metrics.daily.map((day) => (
                <div key={day.label} className="flex h-full min-w-0 flex-col justify-end gap-2">
                  <div className="flex flex-1 items-end rounded bg-slate-100 p-1">
                    <div
                      className="w-full rounded bg-emerald-500"
                      style={{ height: `${Math.max((day.revenue / metrics.maxDailyRevenue) * 100, day.revenue ? 8 : 0)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="truncate text-xs font-bold text-slate-700">{day.label}</p>
                    <p className="text-xs text-slate-500">{MONEY.format(day.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-black">Today mode</h2>
              <div className="mt-4 space-y-3">
                <ModeBar label="Black & White" value={metrics.bwJobs} total={metrics.todayJobs} />
                <ModeBar label="Color" value={metrics.colorJobs} total={metrics.todayJobs} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
              <p className="text-sm font-semibold text-slate-300">Week total</p>
              <p className="mt-2 text-3xl font-black">{MONEY.format(metrics.weekRevenue)}</p>
              <p className="mt-1 text-sm text-slate-400">{jobs.length} jobs in the last 7 days</p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-lg font-black">Recent print jobs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3 text-right">Pages</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.slice(0, 20).map((job) => (
                  <tr key={job.id || `${job.created_at}-${job.original_file_name}`} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{TIME.format(new Date(job.created_at))}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold">{job.customer_token || job.queue_number || '-'}</td>
                    <td className="px-4 py-3">{job.customer_name || 'Walk-in customer'}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-slate-600">{job.original_file_name || '-'}</td>
                    <td className="px-4 py-3">{job.color_mode || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">{numberValue(job.total_print_pages)}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
                      {MONEY.format(numberValue(job.total_amount))}
                    </td>
                  </tr>
                ))}
                {!jobs.length && (
                  <tr>
                    <td colSpan="7" className="px-4 py-10 text-center text-sm text-slate-500">
                      No print jobs found for the last 7 days.
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
