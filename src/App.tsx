import { useEffect, useRef, useState } from 'react'
import './App.css'
import { AppNavigation } from './components/AppNavigation'
import { AccountsSection } from './features/accounts/AccountsSection'
import { CategoriesSection } from './features/categories/CategoriesSection'
import { DashboardSection } from './features/dashboard/DashboardSection'
import { TransactionsSection } from './features/transactions/TransactionsSection'
import { MoreSection } from './features/more/MoreSection'
import { useAppNavigation } from './features/navigation/useAppNavigation'
import { DataBackupSection } from './features/dataBackup/DataBackupSection'
import { ObligationsSection } from './features/obligations/ObligationsSection'
import { FinanceSettingsProvider } from './features/financeSettings/FinanceSettingsProvider'
import { FinanceSettingsForm } from './features/financeSettings/FinanceSettingsForm'
import { ReportsRoute } from './features/reports/ReportsRoute'

function Application() {
  const { screen, destination, accountId, obligationId, obligationMonth } = useAppNavigation()
  const [newTransactionRequest, setNewTransactionRequest] = useState(0)
  const mainRef = useRef<HTMLElement>(null)
  const previousScreen = useRef(screen)

  useEffect(() => {
    const title = accountId !== undefined ? 'Account details' : screen === 'more/categories' ? 'Categories'
      : screen === 'more/data-backup' ? 'Data & Backup'
      : screen === 'more/finance-settings' ? 'Finance settings'
      : screen === 'more/reports' ? 'Financial Reports'
      : screen.startsWith('more/bills-installments') ? 'Bills & Installments'
      : destination.charAt(0).toUpperCase() + destination.slice(1)
    document.title = `${title} | My Finance`
    window.scrollTo(0, 0)
  }, [screen, destination, accountId])

  useEffect(() => {
    // Initial rendering (including Strict Mode's replay) is not a navigation.
    if (previousScreen.current === screen) return
    previousScreen.current = screen
    // Give the new screen a named focus target; an opened editor owns its focus.
    if (!mainRef.current?.contains(document.activeElement)) {
      mainRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    }
  }, [screen])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={(event) => {
        event.preventDefault()
        mainRef.current?.querySelector<HTMLElement>('h2')?.focus()
      }}>Skip to content</a>
      <header className="app-header">
        <h1 className="app-identity">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M4 19V9m8 10V4m8 15v-7" />
          </svg>
          My Finance
        </h1>
        {destination !== 'transactions' && <a className="app-add-transaction" href="#transactions/new"
          onClick={() => setNewTransactionRequest((request) => request + 1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
          <span>Add Transaction</span>
        </a>}
      </header>
      <AppNavigation active={destination} />
      <main ref={mainRef} id="main-content" className="app-main">
        {screen === 'home' && <DashboardSection />}
        {destination === 'transactions' && <TransactionsSection key={`${screen}-${newTransactionRequest}`} startNewTransaction={screen === 'transactions/new'} />}
        {destination === 'accounts' && <AccountsSection accountId={accountId} />}
        {screen === 'more' && <MoreSection />}
        {screen === 'more/reports' && <ReportsRoute />}
        {screen === 'more/finance-settings' && <FinanceSettingsForm />}
        {screen.startsWith('more/bills-installments') && <ObligationsSection obligationId={obligationId} initialMonth={obligationMonth} />}
        {screen === 'more/categories' && <>
          <a className="more-back-link" href="#more"><span aria-hidden="true">&larr;</span> Back to More</a>
          <CategoriesSection />
        </>}
        {screen === 'more/data-backup' && <>
          <a className="more-back-link" href="#more"><span aria-hidden="true">&larr;</span> Back to More</a>
          <DataBackupSection />
        </>}
      </main>
    </div>
  )
}

function App() { return <FinanceSettingsProvider><Application /></FinanceSettingsProvider> }

export default App
