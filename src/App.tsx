import './App.css'
import { AccountsSection } from './features/accounts/AccountsSection'
import { CategoriesSection } from './features/categories/CategoriesSection'
import { TransactionsSection } from './features/transactions/TransactionsSection'

function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <h1>My Finance</h1>
        <p>A simple space for your personal finances.</p>
      </header>
      <main id="main-content" className="section-grid" tabIndex={-1}>
        <section className="placeholder-section" aria-labelledby="dashboard-heading">
          <h2 id="dashboard-heading">Dashboard</h2>
          <p>Your monthly spending overview will appear here.</p>
          <span className="placeholder-label">Coming soon</span>
        </section>
        <TransactionsSection />
        <AccountsSection />
        <CategoriesSection />
      </main>
    </div>
  )
}

export default App
