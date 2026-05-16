'use client'

export default function SuccessPanel({ jobs, totalAmount, onReset }) {
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
