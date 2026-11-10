import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal, flushSync } from 'react-dom'
import type { Account, Category } from '../../domain/models'
import type { PreparedReport } from '../../domain/reporting'
import { useMoney } from '../financeSettings/useMoney'
import type { ReportColumn } from './reportView'
import { createReportExport, downloadReportCsv, largePrintRowCount, reportExportFilename, reportRowsCsv, reportSummaryCsv, type ReportExport } from './reportExport'
import { ReportPrint } from './ReportPrint'

export function ReportExportActions({ report, columns, accounts, categories }: {
  report: PreparedReport | null; columns: readonly ReportColumn[]; accounts: readonly Account[]; categories: readonly Category[]
}) {
  const { currencyCode } = useMoney()
  const [printJob, setPrintJob] = useState<ReportExport | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const printing = useRef(false)
  const opener = useRef<HTMLButtonElement | null>(null)
  const restoreFocus = useRef(false)
  function finishPrint() {
    if (!printing.current) return
    printing.current = false; restoreFocus.current = true
    setPrintJob(null); setStatus('Print dialog closed.')
  }
  useEffect(() => {
    window.addEventListener('afterprint', finishPrint)
    return () => window.removeEventListener('afterprint', finishPrint)
  }, [])
  useEffect(() => {
    if (!printJob && restoreFocus.current) { restoreFocus.current = false; opener.current?.focus() }
  }, [printJob])
  function exportCsv(kind: 'rows' | 'summary') {
    if (!report || printing.current) return
    setError(''); setStatus('')
    try {
      const now = new Date(), context = createReportExport(report, columns, currencyCode, accounts, categories, now)
      const filename = reportExportFilename(kind, now)
      downloadReportCsv(kind === 'rows' ? reportRowsCsv(context) : reportSummaryCsv(context), filename)
      setStatus(`Download prepared: ${filename}`)
    } catch { setError('The CSV could not be prepared. Try a smaller date range or refresh the report.') }
  }
  function print(event: MouseEvent<HTMLButtonElement>) {
    if (!report || printing.current) return
    if (report.rows.length > largePrintRowCount && !window.confirm(`Print all ${report.rows.length.toLocaleString()} matching transactions? Large reports may take time and memory to lay out. You can cancel and use CSV instead. No rows will be omitted.`)) return
    setError(''); setStatus('')
    try {
      const context = createReportExport(report, columns, currencyCode, accounts, categories)
      opener.current = event.currentTarget; printing.current = true
      // Native printing needs the complete DOM committed before it opens.
      flushSync(() => setPrintJob(context))
      window.print()
    } catch {
      finishPrint(); setError('Printing could not be opened. Try again or use CSV.')
    }
  }
  const disabled = !report || !!printJob
  return <div className="report-exports">
    <div className="report-export-actions" role="group" aria-label="Export report">
      <button type="button" onClick={() => exportCsv('rows')} disabled={disabled}>Export CSV</button>
      <button type="button" onClick={() => exportCsv('summary')} disabled={disabled}>Summary CSV</button>
      <button type="button" onClick={print} disabled={disabled}>Print / Save as PDF</button>
    </div>
    <p>Exports include every matching transaction and the selected columns. Report CSV files are for analysis; use Data &amp; Backup for restorable files.</p>
    {status && <p role="status">{status}</p>}{error && <p className="report-error" role="alert">{error}</p>}
    {printJob && <p role="status">All {printJob.report.matchedTransactionCount} matching transactions are ready for printing. <button type="button" onClick={finishPrint}>Close print view</button></p>}
    {printJob && createPortal(<ReportPrint context={printJob} />, document.body)}
  </div>
}
