'use client'

import { MAX_DOCUMENTS, docTotals, fmtSize, paperDimensions } from '@/utils/printUtils'
import { Field, OrderTotal, PaperPreview, Radio, SummaryStat } from './shared'

export default function Home({
  customerName,
  setCustomerName,
  docs,
  readyDocs,
  orderTotals,
  onAddDocument,
  onPickFile,
  onClearDoc,
  onRemoveDoc,
  onSettingChange,
}) {
  return (
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
            onPick={(picked) => onPickFile(doc.id, picked)}
            onClear={() => onClearDoc(doc.id)}
            onRemove={() => onRemoveDoc(doc.id)}
            onSettingChange={(name, value) => onSettingChange(doc.id, name, value)}
          />
        ))}
      </div>

      {readyDocs.length > 1 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div>
            <p className="text-sm font-bold text-green-950">Multiple documents ready</p>
            <p className="text-sm text-green-800">
              {readyDocs.length} PDFs will be submitted together under one customer token.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onAddDocument}
          disabled={docs.length >= MAX_DOCUMENTS}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:text-slate-300"
        >
          + Add another PDF
        </button>
        <OrderTotal pages={orderTotals.pages} amount={orderTotals.amount} />
      </div>
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
