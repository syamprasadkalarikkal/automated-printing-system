'use client'

export function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-sm sm:grid-cols-[110px_1fr] sm:items-center">
      <span className="font-medium text-slate-900">{label}:</span>
      {children}
    </label>
  )
}

export function Radio({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="radio" checked={checked} onChange={onChange} className="accent-green-600" />
      <span>{label}</span>
    </label>
  )
}

export function SummaryStat({ label, value }) {
  return (
    <div className="rounded border border-slate-300 bg-white px-2 py-2">
      <p className="font-mono text-lg font-bold text-slate-900">{value}</p>
      <p className="text-slate-500">{label}</p>
    </div>
  )
}

export function OrderTotal({ pages, amount }) {
  return (
    <div className="rounded-md bg-slate-900 px-4 py-3 text-white">
      <p className="text-xs font-semibold uppercase text-slate-300">Total</p>
      <p className="font-mono text-xl font-black">
        {pages} pages · Rs.{amount}
      </p>
    </div>
  )
}

export function PaperPreview({ dimensions, pageNumber }) {
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
