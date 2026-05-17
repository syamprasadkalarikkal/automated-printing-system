'use client'

import Image from 'next/image'

export default function SuccessPanel({ jobs, totalAmount, onReset }) {
  const mainToken = jobs[0]?.customerToken || 'C--'
  const totalPages = jobs.reduce((sum, job) => sum + (Number(job.pages) || 0), 0)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <Image
          src="/logo/printq-logo.svg"
          alt="PrintQ"
          width={188}
          height={48}
          className="h-12 w-[188px] object-contain"
        />
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-950 shadow-sm">
          ✓
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">Print job received</h2>
          <p className="mt-1 text-sm text-slate-500">Your files are saved and ready for the counter.</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Counter token</p>
        <p className="mt-2 font-mono text-6xl font-black leading-none tracking-tight text-slate-950 sm:text-7xl">
          {mainToken}
        </p>
        <p className="mt-3 text-sm font-medium text-slate-600">Show this token at the Akshaya center counter.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryItem label="Documents" value={jobs.length || '-'} />
        <SummaryItem label="Pages" value={totalPages || '-'} />
        <SummaryItem label="Amount" value={`Rs.${totalAmount}`} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-left">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-bold text-slate-950">Submitted files</p>
        </div>
        {jobs.map((job, index) => (
          <div
            key={`${job.customerToken}-${index}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{job.fileName}</p>
              <p className="text-xs text-slate-500">
                Token {job.customerToken} · {job.pages} pages
              </p>
            </div>
            <p className="font-mono text-base font-bold text-slate-950">Rs.{job.amount}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mx-auto rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
      >
        Upload another order
      </button>
    </div>
  )
}

function SummaryItem({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-center">
      <p className="font-mono text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  )
}
