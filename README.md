# My Finance

A local-first personal finance app with Expense, Income, Transfer, and Refund tracking;
accounts and credit-card balances; advanced transaction filtering; a monthly
dashboard; Bills & Installments with payment history; Sage, Ocean, and Dark themes;
first-run setup for a single workspace; country, currency, and fiscal preferences;
JSON backup/restore; currency-aware CSV import/export; and an
installable PWA shell.

Data is stored in the current browser on the current device. Clearing site or
browser data may erase it. **Full Backup is recommended.** Installing My Finance
does not create cloud synchronization. There is no backend, analytics, tracking,
or financial-data upload.

## Build and run

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Deploy the complete `dist/` directory to static HTTPS hosting. The same build
works at the site root or a subdirectory, such as `/my-finance/`; keep the trailing
slash. Production uses neither the development server nor source-module URLs.
Service workers require HTTPS, with localhost allowed for testing.

After the first successful online visit and service-worker installation, the
application shell and its local data are available offline. Use the browser's
Install/Add to Home Screen command where supported; iOS uses Safari's Share menu.
Updates wait until all existing app tabs/windows have closed and become available
when the app is reopened. They never reset financial records or preferences.

See [v1.0.0 release and PWA notes](docs/release-v1.0.0.md) for hosting, update safety,
validation commands, and browser limitations. [Data & Backup](docs/data-backup.md)
documents JSON v3, v1/v2 restore compatibility, workspace settings and CSV currency safety. The
[Bills & Installments foundation](src/domain/obligations/README.md) and
[tracking UI](src/features/obligations/README.md) document existing semantics.


## v1.2 transaction improvements

Development is on `feature/v1.2-transaction-improvements`; the current released
version is v1.1.0. [Inline categories and Refunds](docs/transaction-improvements.md)
documents draft preservation, refund balances, signed net Expenses, chart presentation,
and Backup v3 / CSV compatibility. No database migration or new dependency is needed.

## v1.1.0 release

[Release notes and validation](docs/release-v1.1.0.md) document the released
feature inventory and upgrade checks.

## v1.1 finance settings

[Onboarding and finance settings](docs/finance-settings.md) documents
schema v3, exact legacy preservation, currency restrictions, confirmation,
startup, and workspace-currency behavior. No financial values are converted.

V1.1 has one workspace. Onboarding and Finance settings expose Country / Region,
Currency, and Fiscal year start. Multiple workspaces/profiles are planned for a
future version; there is no Personal / Business selection in v1.1.

Optional Expense Tax / VAT and receipt metadata are documented in [Expense tax and receipt details](docs/expense-tax-receipts.md). Transaction amounts remain the total paid.

Home spending uses an accessible SVG donut with exact category amounts and percentages. See the [monthly dashboard](src/features/dashboard/README.md) for grouping, accessibility and validation.
