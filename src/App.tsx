import { useEffect, useRef, useState } from 'react'
import './App.css'
import { AppNavigation } from './components/AppNavigation'
import { AccountsSection } from './features/accounts/AccountsSection'
import { CategoriesSection } from './features/categories/CategoriesSection'
import { DashboardSection } from './features/dashboard/DashboardSection'
import { TransactionsSection } from './features/transactions/TransactionsSection'
import { MoreSection } from './features/more/MoreSection'
import { useAppNavigation } from './features/navigation/useAppNavigation'

function App() {
  const { screen, destination } = useAppNavigation()
  const [newTransactionRequest, setNewTransactionRequest] = useState(0)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const title = screen === 'more/categories' ? 'Categories'
      : destination.charAt(0).toUpperCase() + destination.slice(1)
    document.title = `${title} | My Finance`
    window.scrollTo(0, 0)
    // Give the new screen a named focus target; an opened editor owns its focus.
    if (!mainRef.current?.contains(document.activeElement)) {
      mainRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    }
  }, [screen, destination])

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
        <a className="app-add-transaction" href="#transactions/new"
          onClick={() => setNewTransactionRequest((request) => request + 1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
          <span>Add Transaction</span>
        </a>
      </header>
      <AppNavigation active={destination} />
      <main ref={mainRef} id="main-content" className="app-main">
        {screen === 'home' && <DashboardSection />}
        {destination === 'transactions' && <TransactionsSection key={`${screen}-${newTransactionRequest}`} startNewTransaction={screen === 'transactions/new'} />}
        {screen === 'accounts' && <AccountsSection />}
        {screen === 'more' && <MoreSection />}
        {screen === 'more/categories' && <>
          <a className="more-back-link" href="#more"><span aria-hidden="true">&larr;</span> Back to More</a>
          <CategoriesSection />
        </>}
      </main>
    </div>
  )
}

export default App
