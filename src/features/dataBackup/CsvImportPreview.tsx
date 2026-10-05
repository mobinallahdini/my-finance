import { useMoney } from '../financeSettings/useMoney'
import { useMemo, useRef, useState } from 'react'
import type { Transaction } from '../../domain/models'
import type { FinancialSnapshot } from '../../persistence/snapshotValidation'
import { parseDollars } from '../accounts/money'
import { accountTypeLabels } from '../accounts/accountLabels'
import { signedTransactionAmount } from '../transactions/transactionPresentation'
import { BackupDialog } from './BackupDialog'
import { csvRowStatuses, previewTransactionCsv, type CsvMappings, type CsvPreviewRow, type CsvRowStatus, type CsvSourceRow, type MappingField } from './transactionCsv'

const pageSize = 20
const mappingLabels = { accountId: 'Account', categoryId: 'Category', fromAccountId: 'From account', toAccountId: 'To account' }
function amountText(row: CsvPreviewRow) {
  try {
    const type = row.fields.type
    if (type !== 'expense' && type !== 'income' && type !== 'transfer') return row.fields.amount || 'Amount missing'
    return signedTransactionAmount({ type, amount: parseDollars(row.fields.amount) }, row.fields.currency_code)
  } catch { return row.fields.amount || 'Amount missing' }
}
export function CsvImportPreview({ source, filename, snapshot, busy, error, available, onClose, onImport }: {
  source: readonly CsvSourceRow[]
  filename: string
  snapshot: FinancialSnapshot
  busy: boolean
  error: string
  available: boolean
  onClose: () => void
  onImport: (transactions: readonly Transaction[], counts: Record<CsvRowStatus, number>, currencyCode: string) => void
}) {
  const { currencyCode } = useMoney()
  const [mappings, setMappings] = useState<CsvMappings>({})
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set())
  const [statusFilter, setStatusFilter] = useState<CsvRowStatus | 'all'>('all')
  const [page, setPage] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const rows = useMemo(() => available ? previewTransactionCsv(source, snapshot, currencyCode, mappings) : [], [source, snapshot, mappings, currencyCode, available])
  const counts = Object.fromEntries(csvRowStatuses.map((status) => [status, rows.filter((row) => row.status === status).length])) as Record<CsvRowStatus, number>
  const selected = rows.filter((row) => row.status === 'Ready' && !excluded.has(row.rowNumber))
  const filtered = statusFilter === 'all' ? rows : rows.filter((row) => row.status === statusFilter)
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const activePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(activePage * pageSize, (activePage + 1) * pageSize)
  const accountName = (id: string | undefined, fallback: string) => snapshot.accounts.find((account) => account.id === id)?.name ?? (fallback || 'Account not mapped')
  function changeMapping(row: CsvPreviewRow, field: MappingField, id: string, target: HTMLSelectElement) {
    setMappings((current) => ({ ...current, [row.rowNumber]: { ...current[row.rowNumber], [field]: id } }))
    // Keep the edited row discoverable when its status changes under a status filter.
    setStatusFilter('all'); setPage(Math.floor(rows.indexOf(row) / pageSize))
    window.requestAnimationFrame(() => {
      if (!target.isConnected || !target.getClientRects().length) {
        listRef.current?.querySelector<HTMLElement>(`[data-csv-row="${row.rowNumber}"] h3`)?.focus()
      }
    })
  }
  function mappingField(row: CsvPreviewRow, field: MappingField) {
    const choices = field === 'categoryId' ? snapshot.categories.filter((category) => category.type === row.fields.type)
      : snapshot.accounts.filter((account) => row.fields.type !== 'income' || account.type !== 'credit_card')
    const value = choices.some((choice) => choice.id === row.mapping[field]) ? row.mapping[field] : ''
    return <div className="backup-mapping-field" key={field}>
      <label htmlFor={`csv-${row.rowNumber}-${field}`}>{mappingLabels[field]} for row {row.rowNumber}</label>
      <select id={`csv-${row.rowNumber}-${field}`} disabled={busy} value={value}
        onChange={(event) => changeMapping(row, field, event.currentTarget.value, event.currentTarget)}>
        <option value="">Choose an existing {field === 'categoryId' ? 'category' : 'account'}</option>
        {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name} ({choice.type === 'expense' || choice.type === 'income'
          ? choice.type === 'expense' ? 'Expense' : 'Income' : accountTypeLabels[choice.type]})</option>)}
      </select>
    </div>
  }
  return <BackupDialog title="Import transactions" wide busy={busy} error={error} onClose={onClose}
    action={<button className="button-primary" type="button" disabled={busy || !available || !selected.length}
      onClick={() => onImport(selected.map((row) => row.transaction!), counts, selected[0].fields.currency_code)}>Import {selected.length} {selected.length === 1 ? 'transaction' : 'transactions'}</button>}>
    <p className="backup-filename">{filename}</p>
    <p className="backup-help">CSV amounts use {source[0]?.fields.currency_code ?? currencyCode}. No currency conversion occurs.</p>
    <p className="backup-help">Only selected Ready rows will be added. Duplicates, invalid rows, conflicts, and unmapped rows are skipped.</p>
    <p className="backup-csv-counts" role="status">{source.length} rows found. {csvRowStatuses.map((status) => `${status}: ${counts[status]}`).join(' · ')}</p>
    <div className="backup-preview-controls">
      <div className="backup-mapping-field">
        <label htmlFor="csv-status-filter">Show rows</label>
        <select id="csv-status-filter" value={statusFilter} disabled={busy}
          onChange={(event) => { setStatusFilter(event.currentTarget.value as CsvRowStatus | 'all'); setPage(0) }}>
          <option value="all">All rows ({source.length})</option>
          {csvRowStatuses.map((status) => <option key={status} value={status}>{status} ({counts[status]})</option>)}
        </select>
      </div>
      <div className="backup-ready-controls">
        <button className="button-quiet" type="button" disabled={busy || !counts.Ready} onClick={() => setExcluded(new Set())}>Select all Ready</button>
        <button className="button-quiet" type="button" disabled={busy || !counts.Ready}
          onClick={() => setExcluded(new Set(rows.filter((row) => row.status === 'Ready').map((row) => row.rowNumber)))}>Deselect Ready</button>
      </div>
    </div>
    <ul ref={listRef} className="backup-preview-list">
      {visible.map((row) => {
        const type = row.fields.type
        const categoryName = snapshot.categories.find((category) => category.id === row.mapping.categoryId)?.name ?? (row.fields.category_name || 'Category not mapped')
        return <li key={row.rowNumber} data-csv-row={row.rowNumber}>
          <div className="backup-preview-row-heading">
            <h3 tabIndex={-1}>Row {row.rowNumber} · {type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : type === 'transfer' ? 'Transfer' : type || 'Type missing'}</h3>
            <span className={`backup-row-status${row.status === 'Invalid' || row.status === 'Conflict' ? ' financial-danger' : ''}`}>{row.status}</span>
          </div>
          <div className="backup-preview-row-main">
            <strong>{type === 'transfer' ? 'Transfer' : categoryName}</strong>
            <span className={`financial-value financial-${type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'neutral'}`}>{amountText(row)}</span>
          </div>
          <p className="backup-row-detail"><time>{row.fields.date || 'Date missing'}</time> · {type === 'transfer'
            ? `From ${accountName(row.mapping.fromAccountId, row.fields.from_account_name)} → To ${accountName(row.mapping.toAccountId, row.fields.to_account_name)}`
            : accountName(row.mapping.accountId, row.fields.account_name)}</p>
          <p className="backup-row-message">{row.message}</p>
          {row.status === 'Ready' && <label className="backup-check backup-row-selection">
            <input type="checkbox" disabled={busy} checked={!excluded.has(row.rowNumber)} aria-label={`Import row ${row.rowNumber}, ${type} on ${row.fields.date}`}
              onChange={() => setExcluded((current) => {
                const next = new Set(current)
                if (next.has(row.rowNumber)) next.delete(row.rowNumber); else next.add(row.rowNumber)
                return next
              })} /> <span>Import this row</span>
          </label>}
          {row.fields.note && <details className="backup-note"><summary>Note</summary><pre>{row.fields.note}</pre></details>}
          {row.status !== 'Duplicate' && (type === 'transfer' || type === 'income' || type === 'expense') && <details className="backup-row-mapping">
            <summary>Map accounts and categories</summary>
            {type === 'transfer' ? <>{mappingField(row, 'fromAccountId')}{mappingField(row, 'toAccountId')}</>
              : <>{mappingField(row, 'accountId')}{mappingField(row, 'categoryId')}</>}
          </details>}
        </li>
      })}
    </ul>
    {filtered.length === 0 && <p className="backup-help">No rows with this status.</p>}
    <div className="backup-pagination" aria-label="Preview pages">
      <button type="button" disabled={busy || activePage === 0} onClick={() => setPage(activePage - 1)}>Previous</button>
      <span>Page {activePage + 1} of {pageCount}</span>
      <button type="button" disabled={busy || activePage + 1 >= pageCount} onClick={() => setPage(activePage + 1)}>Next</button>
    </div>
  </BackupDialog>
}
