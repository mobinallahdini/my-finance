import { formatMoney } from '../accounts/money'
import { reportAccountGroupingExplanation, reportCashFlowExplanation, reportCellText, reportSummaryMetrics } from './reportPresentation'
import { reportGroupLabel, reportGroupingLabels, type ReportExport } from './reportExport'
import './reportPrint.css'

export function ReportPrint({ context }: { context: ReportExport }) {
  const { report, columns, currencyCode } = context
  const amount = (value: number) => formatMoney(value, currencyCode)
  return <article className="report-print" aria-label="Printable Financial Report">
    <header><h1>My Finance / Financial Report</h1>
      <p>Generated <time dateTime={context.generatedAt}>{new Date(context.generatedAt).toLocaleString(undefined, {
        dateStyle: 'long', timeStyle: 'long',
      })}</time></p>
      <p><strong>Date range:</strong> {context.dateRange}</p><p><strong>Workspace currency:</strong> {currencyCode}</p>
    </header>
    <section aria-labelledby="report-print-filters"><h2 id="report-print-filters">Applied filters</h2>
      <dl className="report-print-filters">{context.filters.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p>Filters combine with AND; selections within a filter use OR. Account and account-type restrictions match the same eligible endpoint.</p>
    </section>
    <section aria-labelledby="report-print-summary"><h2 id="report-print-summary">Report summary</h2>
      <dl className="report-print-metrics">{reportSummaryMetrics.map(([key, label]) => <div key={key}>
        <dt>{label}</dt><dd data-print-metric={key}>{key === 'transactionCount' ? report.summary[key] : amount(report.summary[key])}</dd>
      </div>)}</dl><p>{reportCashFlowExplanation}</p>
    </section>
    <section aria-labelledby="report-print-grouping"><h2 id="report-print-grouping">Grouping: {reportGroupingLabels[report.grouping]}</h2>
      {report.grouping !== 'none' && <>
        <p>All groups are shown below. The transaction table lists every matching transaction once.</p>
        {report.grouping === 'account' && <p>{reportAccountGroupingExplanation}</p>}
        <table className="report-print-groups"><caption>Group summaries, in {currencyCode}</caption><thead><tr>
          <th scope="col">Group</th>{reportSummaryMetrics.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}
          {report.grouping === 'account' && <><th scope="col">Transfer In</th><th scope="col">Transfer Out</th></>}
        </tr></thead><tbody>{report.groups.map(group => <tr key={group.key} data-print-group={group.key}>
          <th scope="row">{reportGroupLabel(group)}</th>{reportSummaryMetrics.map(([key]) => <td key={key}>
            {key === 'transactionCount' ? group.summary[key] : amount(group.summary[key])}</td>)}
          {group.kind === 'account' && <><td>{amount(group.transferInCents)}</td><td>{amount(group.transferOutCents)}</td></>}
        </tr>)}</tbody></table>
      </>}
    </section>
    <section aria-labelledby="report-print-transactions"><h2 id="report-print-transactions">Transactions</h2>
      <p>{report.matchedTransactionCount} matching transactions. Amounts use Expense − / Income + / Refund +; Transfers show volume.</p>
      <table><caption>All matching transactions, in {currencyCode}</caption><thead><tr>{columns.map(([key, label]) =>
        <th scope="col" key={key} data-print-column={key}>{label}</th>)}</tr></thead>
        <tbody>{report.rows.map(row => <tr key={row.id} data-print-row={row.id}>{columns.map(([key]) =>
          <td key={key} data-print-column={key}>{reportCellText(row, key, currencyCode)}</td>)}</tr>)}</tbody>
      </table>{report.rows.length === 0 && <p>No matching transactions.</p>}
    </section>
  </article>
}
