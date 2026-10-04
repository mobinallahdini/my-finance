import './more.css'

export function MoreSection() {
  return (
    <section className="more-section" aria-labelledby="more-heading">
      <h2 id="more-heading" tabIndex={-1}>More</h2>
      <nav className="more-utilities" aria-label="Utilities">
        <ul className="more-list">
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
        </ul>
      </nav>
      <section className="more-storage" aria-labelledby="more-storage-heading">
        <h3 id="more-storage-heading">Local data</h3>
        <p>Your financial data is saved in this browser on this device. Clearing this site's browser storage removes it.</p>
      </section>
    </section>
  )
}
