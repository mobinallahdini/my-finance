import { useEffect, useMemo, useRef, useState } from 'react'
import type { PreparedReport, ReportGrouping } from '../../domain/reporting'
import type { FinancialSummary } from '../../domain/financialSummary'
import { transactionTypeLabels } from '../../domain/transactionQuery'
import { useMoney } from '../financeSettings/useMoney'
import { readableMonth } from '../transactions/transactionPresentation'
import { visibleReportColumns, reportPageSize, type ReportView } from './reportView'
import { updateReportsSession } from './useReportsSession'
import { reportAccountGroupingExplanation, reportCashFlowExplanation, reportCellText, reportSummaryMetrics } from './reportPresentation'

export function ReportSummary({ report }: { report: PreparedReport }) {
  const { formatAmount, currencyCode } = useMoney()
  const summary = report.summary
  const metrics = reportSummaryMetrics.filter(([key]) => key !== 'netCashFlowCents')
  return <section className="report-overview" aria-label={`Report summary, in ${currencyCode}`}>
    <dl className="report-cash-flow"><dt>Net Cash Flow</dt>
      <dd data-metric="netCashFlowCents" className="financial-value">{formatAmount(summary.netCashFlowCents)}</dd></dl>
    <dl className="report-metrics">{metrics.map(([key, label]) => <div key={key}>
      <dt>{label}</dt><dd data-metric={key} className="financial-value">{key === 'transactionCount' ? summary[key] : formatAmount(summary[key])}</dd>
    </div>)}</dl>
    <p className="report-explanation">{reportCashFlowExplanation}</p>
  </section>
}

function GroupMetrics({ summary }: { summary: FinancialSummary }) {
  const { formatAmount } = useMoney()
  return <>{([['totalIncomeCents', 'Income'], ['netExpensesCents', 'Net Expenses'], ['netCashFlowCents', 'Net Cash Flow']] as const)
    .map(([key, label]) => <div key={key}><dt>{label}</dt><dd data-group-metric={key}>{formatAmount(summary[key])}</dd></div>)}</>
}

export function ReportResults({ report, view }: { report: PreparedReport; view: ReportView }) {
  const { formatAmount, currencyCode } = useMoney()
  const groups = useMemo(() => new Map(report.groups.map(group => [group.key, group])), [report])
  const rowsById = useMemo(() => new Map(report.rows.map(row => [row.id, row])), [report])
  const group = view.grouping === 'none' ? undefined : groups.get(view.groupKey ?? '') ?? report.groups[0]
  const scope = group?.key ?? 'all'
  const count = group?.summary.transactionCount ?? report.matchedTransactionCount
  const pages = Math.max(1, Math.ceil(count / reportPageSize))
  const [position, setPosition] = useState<{ report: PreparedReport; scope: string; page: number } | null>(null)
  const page = position?.report === report && position.scope === scope ? Math.min(position.page, pages - 1) : 0
  const start = page * reportPageSize
  const visibleRows = group ? group.transactionIds.slice(start, start + reportPageSize).map(id => rowsById.get(id)!)
    : report.rows.slice(start, start + reportPageSize)
  const columns = visibleReportColumns(view.columns)
  const heading = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef(false)
  useEffect(() => {
    if (pendingFocus.current) { pendingFocus.current = false; heading.current?.focus({ preventScroll: true }) }
  }, [page, report, scope])
  const groupLabel = group?.kind === 'month' ? readableMonth(group.month) : group?.label
  return <section className="report-results" aria-labelledby="report-results-heading">
    <div className="report-results-header">
      <h3 ref={heading} id="report-results-heading" tabIndex={-1}>Transactions</h3>
      <div className="report-group-controls">
        <div className="report-field"><label htmlFor="report-grouping">Group by</label>
          <select id="report-grouping" value={view.grouping} onChange={event => updateReportsSession({ grouping: event.target.value as ReportGrouping, groupKey: null })}>
            <option value="none">None</option><option value="month">Month</option><option value="category">Category</option>
            <option value="account">Account</option><option value="type">Transaction Type</option>
          </select></div>
        {group && <div className="report-field"><label htmlFor="report-group">Select group</label>
          <select id="report-group" value={group.key} onChange={event => updateReportsSession({ groupKey: event.target.value })}>
            {report.groups.map(item => <option key={item.key} value={item.key}>{item.kind === 'month' ? readableMonth(item.month) : item.label} ({item.summary.transactionCount})</option>)}
          </select></div>}
      </div>
    </div>
    {view.grouping === 'account' && <p className="report-group-note">{reportAccountGroupingExplanation}</p>}
    {group && <section className="report-group-summary" aria-label="Selected group summary">
      <div className="report-group-title"><h4>{groupLabel}</h4><span>{group.summary.transactionCount} transactions in this group</span></div>
      <dl><GroupMetrics summary={group.summary} />
        {group.kind === 'account' ? <>
          <div><dt>Transfer In</dt><dd data-group-metric="transferInCents">{formatAmount(group.transferInCents)}</dd></div>
          <div><dt>Transfer Out</dt><dd data-group-metric="transferOutCents">{formatAmount(group.transferOutCents)}</dd></div>
        </> : <div><dt>Transfer Volume</dt><dd data-group-metric="transferVolumeCents">{formatAmount(group.summary.transferVolumeCents)}</dd></div>}
      </dl>
    </section>}
    <div className="report-table-scroll" tabIndex={0} role="region" aria-label="Transaction report table; scroll horizontally for additional columns">
      <table className="report-table">
        <caption>{groupLabel ? `${groupLabel} — ` : ''}Financial report, in {currencyCode}. Page {page + 1} of {pages}.</caption>
        <thead><tr>{columns.map(([key, label]) => <th scope="col" key={key} data-column={key} className={key === 'amountCents' ? 'report-amount' : undefined}>{label}</th>)}</tr></thead>
        <tbody>{visibleRows.map(row => <tr key={row.id} data-report-row={row.id}>
          {columns.map(([key]) => <td key={key} data-column={key} className={key === 'amountCents' ? `report-amount financial-${row.type}` : key === 'type' ? 'report-type' : undefined}>
            {reportCellText(row, key, currencyCode)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <ul className="report-cards" aria-label="Report transactions">{visibleRows.map(row => <li className="report-card" key={row.id} data-report-row={row.id}>
      <div className="report-card-heading"><div>
        {view.columns.includes('type') && <span className="report-type" data-column="type">{transactionTypeLabels[row.type]}</span>}
        {view.columns.includes('date') && <span className="report-card-date" data-column="date">{row.date}</span>}
      </div><strong className={`report-amount financial-${row.type}`} data-column="amountCents">{reportCellText(row, 'amountCents', currencyCode)}</strong></div>
      <dl>{columns.filter(([key]) => !['date', 'type', 'amountCents'].includes(key)).map(([key, label]) => <div key={key}>
        <dt>{label}</dt><dd data-column={key}>{reportCellText(row, key, currencyCode)}</dd>
      </div>)}</dl>
    </li>)}</ul>
    <nav className="report-pagination" aria-label="Report pages">
      <button type="button" disabled={page === 0} onClick={() => { pendingFocus.current = true; setPosition({ report, scope, page: page - 1 }) }}>Previous</button>
      <p role="status">Page {page + 1} of {pages}<span>Showing {count ? start + 1 : 0}–{Math.min(start + reportPageSize, count)} of {count}</span></p>
      <button type="button" disabled={page + 1 >= pages} onClick={() => { pendingFocus.current = true; setPosition({ report, scope, page: page + 1 }) }}>Next</button>
    </nav>
    <p className="report-page-note">25 transactions per page. Summary totals cover every matching transaction.</p>
  </section>
}
