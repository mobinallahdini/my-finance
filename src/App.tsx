import './App.css'
import { AccountsSection } from './features/accounts/AccountsSection'
import { CategoriesSection } from './features/categories/CategoriesSection'
import { DashboardSection } from './features/dashboard/DashboardSection'
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
        <DashboardSection />
        <TransactionsSection />
        <AccountsSection />
        <CategoriesSection />
      </main>
    </div>
  )
}

export default App
