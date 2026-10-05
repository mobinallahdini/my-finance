import { AppearanceSection } from '../appearance/AppearanceSection'
import './more.css'

export function MoreSection() {
  return (
    <section className="more-section" aria-labelledby="more-heading">
      <h2 id="more-heading" tabIndex={-1}>More</h2>
      <nav className="more-utilities" aria-label="Utilities">
        <ul className="more-list">
          <li>
            <a className="more-category-link" href="#more/finance-settings">
              <span><strong>Finance settings</strong><span>Country, currency, and fiscal year</span></span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
            </a>
          </li>
          <li>
            <a className="more-category-link" href="#more/bills-installments">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M5 3h14v18l-3-2-4 2-4-2-3 2ZM8 8h8M8 12h8M8 16h4" />
              </svg>
              <span><strong>Bills &amp; Installments</strong><span>Track monthly bills, installments, due dates, and payments</span></span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
            </a>
          </li>
          <li>
            <a className="more-category-link" href="#more/categories">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z" />
              </svg>
              <span><strong>Categories</strong><span>Organize your income and spending</span></span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
            </a>
          </li>
          <li>
            <a className="more-category-link" href="#more/data-backup">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M5 3h11l3 3v15H5Z M8 3v6h8V3 M8 21v-7h8v7" />
              </svg>
              <span><strong>Data &amp; Backup</strong><span>Export, restore, and move your financial data</span></span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
            </a>
          </li>
        </ul>
      </nav>
      <AppearanceSection />
    </section>
  )
}
