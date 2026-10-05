# My Finance - v1.1 development

A local-first personal finance app with Expense, Income, and Transfer tracking;
accounts and credit-card balances; advanced transaction filtering; a monthly
dashboard; Bills & Installments with payment history; Sage, Ocean, and Dark themes;
first-run workspace setup; country, currency, Personal / Business and fiscal preferences;
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


## v1.1 finance settings

Development is on `feature/v1.1-onboarding-currency`; the released v1.0.0 remains
on `main`. [Onboarding and finance settings](docs/finance-settings.md) documents
schema v3, exact legacy preservation, currency restrictions, confirmation,
startup, and workspace-currency behavior. No financial values are converted.

Optional Expense Tax / VAT and receipt metadata are documented in [Expense tax and receipt details](docs/expense-tax-receipts.md). Transaction amounts remain the total paid.

Home spending uses an accessible SVG donut with exact category amounts and percentages. See the [monthly dashboard](src/features/dashboard/README.md) for grouping, accessibility and validation.
