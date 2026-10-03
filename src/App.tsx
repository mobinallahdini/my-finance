import './App.css'

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
        <section className="placeholder-section" aria-labelledby="transactions-heading">
          <h2 id="transactions-heading">Transactions</h2>
          <p>Your expenses and transaction history will appear here.</p>
          <span className="placeholder-label">Coming soon</span>
        </section>
        <section className="placeholder-section" aria-labelledby="accounts-heading">
          <h2 id="accounts-heading">Accounts</h2>
          <p>Your accounts and their balances will appear here.</p>
          <span className="placeholder-label">Coming soon</span>
        </section>
        <section className="placeholder-section" aria-labelledby="settings-heading">
          <h2 id="settings-heading">Settings</h2>
          <p>Your categories and app preferences will appear here.</p>
          <span className="placeholder-label">Coming soon</span>
        </section>
      </main>
    </div>
  )
}

export default App
