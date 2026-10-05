import { useMoney } from '../financeSettings/useMoney'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { readBackupSource } from '../../persistence/dataBackup'
import { useTheme } from '../appearance/themePreference'
import { BackupDialog } from './BackupDialog'
import { createBackup, exportFilename, parseFullBackup, type BackupSection, type FullBackup } from './backupFormat'
import { CustomExport } from './CustomExport'
import { CsvImportPreview } from './CsvImportPreview'
import { RestorePreview } from './RestorePreview'
import { accountsCsv, categoriesCsv, parseTransactionCsv, transactionCsvCurrency, transactionsCsv, type CsvRowStatus, type CsvSourceRow } from './transactionCsv'
import { useDataBackup } from './useDataBackup'
import type { Transaction } from '../../domain/models'
import './dataBackup.css'

type ExportKind = 'backup' | 'transactions' | 'accounts' | 'categories' | 'custom-backup'
type Preview = { kind: 'custom' } | { kind: 'restore'; backup: FullBackup; filename: string }
  | { kind: 'csv'; source: CsvSourceRow[]; filename: string }
const exports: { kind: ExportKind; title: string; format: string; description: string }[] = [
  { kind: 'backup', title: 'Full Backup', format: 'JSON', description: 'All financial data, bills, installments, workspace settings, and appearance' },
  { kind: 'transactions', title: 'Transactions', format: 'CSV', description: 'All transaction history' },
  { kind: 'accounts', title: 'Accounts', format: 'CSV', description: 'Opening balances and credit limits' },
  { kind: 'categories', title: 'Categories', format: 'CSV', description: 'Income and expense categories' },
  { kind: 'custom-backup', title: 'Custom Backup', format: 'JSON', description: 'Choose which sections to include' },
]

function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = filename
  try { document.body.append(link); link.click() }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'The operation could not be completed.' }

export function DataBackupSection() {
  const { snapshot, isLoading, isWriting, loadError, reload, restore, importTransactions } = useDataBackup()
  const theme = useTheme()
  const { currencyCode } = useMoney()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const opener = useRef<HTMLElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const pendingFocus = useRef(false)
  const busy = preparing || isWriting || isLoading
  const csvCurrency = preview?.kind === 'csv' ? transactionCsvCurrency(preview.source) : null
  const csvError = csvCurrency && csvCurrency !== currencyCode ? `This file uses ${csvCurrency}, but this workspace uses ${currencyCode}.` : ''
  useEffect(() => {
    if (preview || busy || !pendingFocus.current) return
    pendingFocus.current = false
    const target = opener.current?.isConnected && !opener.current.matches(':disabled') ? opener.current : headingRef.current
    target?.focus()
  }, [preview, busy])
  useEffect(() => { if (error && !preview) errorRef.current?.focus() }, [error, preview])
  function closePreview() {
    if (busy) return
    pendingFocus.current = true; setPreview(null); setError('')
  }
  async function exportData(kind: ExportKind, sections?: readonly BackupSection[]) {
    if (busy || loadError) return
    setPreparing(true); setError(''); setStatus('')
    try {
      const json = kind === 'backup' || kind === 'custom-backup'
      let content: string
      if (json) {
        const current = await readBackupSource()
        content = JSON.stringify(createBackup(current.snapshot, theme, sections, kind === 'backup' ? 'full' : 'custom', new Date()), null, 2)
      } else {
        const source = await readBackupSource()
        const current = source.snapshot
        content = kind === 'transactions' ? transactionsCsv(current, source.currencyCode) : kind === 'accounts' ? accountsCsv(current.accounts, source.currencyCode) : categoriesCsv(current.categories)
      }
      const filename = exportFilename(kind)
      downloadFile(content, filename, json ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8')
      setStatus(`Download prepared: ${filename}`)
      if (preview?.kind === 'custom') { pendingFocus.current = true; setPreview(null) }
    } catch (error) { setError(`Export could not be prepared. ${errorMessage(error)}`) }
    finally { setPreparing(false) }
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>, kind: 'restore' | 'csv') {
    const input = event.currentTarget, file = input.files?.[0]
    input.value = ''
    if (!file || busy || loadError) return
    opener.current = input; setPreparing(true); setError(''); setStatus('')
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      if (kind === 'restore') setPreview({ kind, backup: parseFullBackup(text), filename: file.name })
      else setPreview({ kind, source: parseTransactionCsv(text, (await readBackupSource()).currencyCode), filename: file.name })
    } catch (error) { setError(`File could not be opened. ${errorMessage(error)} Current data has not been changed.`) }
    finally { setPreparing(false) }
  }
  async function replaceData() {
    if (preview?.kind !== 'restore' || busy || loadError) return
    const legacyWarning = preview.backup.schemaVersion === 1 ? ' This version 1 backup contains no Bills & Installments; all current obligations and recorded payments will be removed.' : ''
    if (!window.confirm(`Replace current data? This will replace all local accounts, categories, transactions, bills, installments, and recorded payments with this backup.${legacyWarning} Workspace currency will become ${preview.backup.currency}. Country and fiscal year preferences will be replaced with the previewed settings. This cannot be undone.`)) return
    setError(''); setStatus('')
    try {
      const persisted = await restore(preview.backup)
      setStatus(persisted ? 'All data, workspace settings, and appearance restored. Current local data was replaced.'
        : 'All data and workspace settings restored. Appearance was applied for this session, but the preference could not be saved to browser storage.')
      pendingFocus.current = true; setPreview(null)
    } catch (error) { setError(`Restore failed. Previous financial data, bills, installments, payments, and workspace settings are intact. ${errorMessage(error)}`) }
  }
  async function importRows(transactions: readonly Transaction[], counts: Record<CsvRowStatus, number>, fileCurrency: string) {
    if (busy || loadError || Boolean(csvError)) return
    setError(''); setStatus('')
    try {
      const imported = await importTransactions(transactions, fileCurrency)
      const skipped = counts.Duplicate + counts['Needs mapping'] + counts.Invalid + counts.Conflict + counts.Ready - imported
      setStatus(`${imported} ${imported === 1 ? 'transaction' : 'transactions'} imported. ${counts.Duplicate} duplicates skipped.${skipped > counts.Duplicate ? ` ${skipped - counts.Duplicate} other rows not imported.` : ''}`)
      pendingFocus.current = true; setPreview(null)
    } catch (error) { setError(`No transactions were imported. ${errorMessage(error)}`) }
  }
  return <section className="data-backup-section" aria-labelledby="data-backup-heading" aria-busy={busy}>
    <h2 ref={headingRef} id="data-backup-heading" tabIndex={-1}>Data &amp; Backup</h2>
    <p className="backup-feedback" role="status">{status}</p>
    {preparing && <p className="backup-feedback" role="status">Preparing your local file…</p>}
    {isLoading && <p className="backup-feedback" role="status">Reading local data…</p>}
    {loadError && <div className="backup-recovery"><p className="backup-error" role="alert">{loadError}</p>
      <button type="button" disabled={busy} onClick={reload}>Retry</button></div>}
    {error && !preview && <p ref={errorRef} className="backup-error" role="alert" tabIndex={-1}>{error}</p>}
    <section className="backup-section" aria-labelledby="backup-export-heading">
      <h3 id="backup-export-heading">Export</h3>
      <p className="backup-help">Full Backup is recommended for recovery. CSV files are for spreadsheets, inspection, and analysis.</p>
      <ul className="backup-export-list">
        {exports.map((option) => <li key={option.kind}>
          <button type="button" className="backup-export-row" disabled={busy || Boolean(loadError)}
            onClick={(event) => {
              opener.current = event.currentTarget
              if (option.kind === 'custom-backup') { setError(''); setStatus(''); setPreview({ kind: 'custom' }) }
              else void exportData(option.kind)
            }}>
            <span><strong>{option.title}</strong><span className="backup-row-description">{option.description}</span></span>
            <span className="backup-format">{option.format}</span>
          </button>
        </li>)}
      </ul>
      <p className="backup-help backup-privacy">Backup files contain your financial data. Store them securely. JSON backups include workspace settings and currency.</p>
    </section>
    <section className="backup-section" aria-labelledby="backup-import-heading">
      <h3 id="backup-import-heading">Import / Restore</h3>
      <div className="backup-file-choice">
        <label htmlFor="backup-restore-file">Restore Full Backup <span>JSON</span></label>
        <p id="backup-restore-help" className="backup-help">Preview a validated backup before replacing current local data.</p>
        <input id="backup-restore-file" type="file" accept=".json,application/json" disabled={busy || Boolean(loadError)}
          aria-describedby="backup-restore-help" onChange={(event) => { void readFile(event, 'restore') }} />
      </div>
      <div className="backup-file-choice">
        <label htmlFor="backup-csv-file">Import Transactions <span>CSV</span></label>
        <p id="backup-csv-help" className="backup-help">Use a My Finance Transactions export in the same currency as this workspace. Legacy CAD exports are also supported in CAD workspaces. Preview, map references, and choose Ready rows. Bank statement, Accounts, and Categories CSV imports are not supported.</p>
        <input id="backup-csv-file" type="file" accept=".csv,text/csv" disabled={busy || Boolean(loadError)}
          aria-describedby="backup-csv-help" onChange={(event) => { void readFile(event, 'csv') }} />
      </div>
    </section>
    <section className="backup-section" aria-labelledby="backup-local-heading">
      <h3 id="backup-local-heading">Local data information</h3>
      {!isLoading && !loadError && <p className="backup-local-counts">{snapshot.accounts.length} accounts · {snapshot.categories.length} categories · {snapshot.transactions.length} transactions · {snapshot.obligations.length} bills &amp; installments · {snapshot.obligationPayments.length} recorded payments</p>}
      <p className="backup-help">Financial data is stored locally on this device and browser. Clearing browser or site data may erase it. A Full Backup is the recommended way to recover or move your data.</p>
    </section>
    {preview?.kind === 'custom' && <CustomExport busy={busy} error={error || loadError || ''} available={!loadError} onClose={closePreview} onExport={(sections) => { void exportData('custom-backup', sections) }} />}
    {preview?.kind === 'restore' && <BackupDialog title="Restore backup" busy={busy} error={error || loadError || ''} onClose={closePreview}
      action={<button className="backup-confirm-restore" type="button" disabled={busy || Boolean(loadError)} onClick={() => { void replaceData() }}>Replace current data</button>}>
      <RestorePreview backup={preview.backup} current={snapshot} filename={preview.filename} />
    </BackupDialog>}
    {preview?.kind === 'csv' && <CsvImportPreview source={preview.source} filename={preview.filename} snapshot={snapshot}
      busy={busy} error={error || loadError || csvError} available={!loadError && !csvError} onClose={closePreview} onImport={(transactions, counts, fileCurrency) => { void importRows(transactions, counts, fileCurrency) }} />}
  </section>
}
