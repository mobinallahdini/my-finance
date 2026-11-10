import { lazy, Suspense } from 'react'
import './reports.css'

const ReportsContent = lazy(() => import('./ReportsSection').then(module => ({ default: module.ReportsSection })))

/** Keep the route focus target mounted while the read-only report code loads. */
export function ReportsRoute() {
  return <>
    <a className="more-back-link report-back-link" href="#more"><span aria-hidden="true">←</span> Back to More</a>
    <section className="reports-section" aria-labelledby="reports-heading">
      <header className="report-header"><div><h2 id="reports-heading" tabIndex={-1}>Financial Reports</h2>
        <p>Explore your income, spending, and transfers.</p></div></header>
      <Suspense fallback={<p className="report-loading" role="status">Loading your report…</p>}>
        <ReportsContent />
      </Suspense>
    </section>
  </>
}
