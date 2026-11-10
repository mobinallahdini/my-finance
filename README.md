# My Finance

A local-first personal finance PWA with Expense, Income, Transfer and Refund
tracking; bank, cash and credit-card balances; Bills & Installments with tracking
payment history; workspace currency and fiscal preferences; and Sage, Ocean and
Dark themes.

## v1.3.0 release candidate

Development is on `feature/v1.3-financial-reports`, based on released **v1.2.0**.
This candidate adds the initial Home navigation focus fix and **Financial Reports**
under **More → Financial Reports**. See [release scope, validation and device
checks](docs/release-v1.3.0.md).

Reports provide current-month/year, all-time and custom dates; account,
account-type, category, transaction-type, amount and text filters; selectable
columns; financial summaries; and grouping by month, category, account or type.
The screen is paginated, while totals and exports cover every matching record.
Filters and report preferences live only in the current app session.

Available outputs are **Report CSV**, **Summary CSV**, and **Print / Save as PDF**
through the browser's native print interface. Outputs use the same prepared report
as the screen, include all matching rows, respect selected columns, and work
offline after the app shell has been installed. CSV text is protected against
spreadsheet formula injection. See [Reports](docs/financial-reports.md) and
[export formats and print limitations](docs/report-exports.md).

**Report CSV is for analysis; it is not a restorable backup or Transactions CSV.**
Use **Data & Backup → Full Backup** for a complete restorable JSON file, or that
screen's canonical Transactions CSV for its established import/export format.
Full Backup remains **v3**, with existing v1/v2 restore compatibility. The database
remains at **schema v3**, with no reporting migration or historical-data rewrite.

Bills & Installments remain tracking-only. There is **no installment-account
integration**, payment-generated transaction, new payment lifecycle, receipt
scanner/OCR, or multiple-workspace feature in v1.3. Receipt numbers and included
Tax/VAT remain manually entered Expense metadata. The linked-payment
[compatibility investigation](docs/database-write-fence-qualification.md) remains
blocked for production and runs separately from reporting-only release checks.

## Local data and preservation

Data stays in the current browser profile on the current device. There is no
backend, analytics, financial-data upload, or cloud synchronization. Reports read
existing records and do not save derived reports, change transactions, deduct
accounts, reconcile history, or convert obligation payments.

Regular **Full Backups are recommended** and should be kept securely. Browser
storage clearing, eviction, device loss, profile/origin changes and private-mode
restrictions can make local data unavailable. Installing the PWA does not protect
against those events or transfer records between devices. Automated upgrade tests
use synthetic fixtures; they do not replace testing supported physical devices.

## Build, run and validate

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Use Node 24. The full reporting-only release checks require installed Chrome,
Git and tar, plus a current production build. They create disposable profiles
and isolated loopback servers, without touching normal browser data:

```sh
npm run build
npm run lint
npm test
npm run test:release:v13:browser
git diff --check
```

The separate `test:installments:compatibility` and
`test:installments:qualification` commands intentionally return **2** when their
investigation assertions complete while future payment linking remains unsafe or
unproven. They must not be changed to PASS to approve this reporting release.

## PWA and hosting

Deploy the complete `dist/` directory to static HTTPS hosting. The relative-path
build works at the root or a project path such as **`/my-finance/`**, with its
trailing slash. Production uses built assets, not development-module URLs.
Service workers require HTTPS, with loopback origins available for testing.

After the first successful online visit and worker installation, the app shell,
local reports and exports are available offline. Updates wait until old app
tabs/windows close and take effect when reopened. This candidate retains the
v1.2 service-worker source and storage behavior. Complete physical iOS/Android
installation, standalone reopening, keyboard/assistive-technology and native
print-dialog checks before general release. No deployment is part of RC preparation.

## Reference

- [v1.2 release](docs/release-v1.2.0.md) and [Refund/inline-category behavior](docs/transaction-improvements.md)
- [Data & Backup](docs/data-backup.md), [finance settings](docs/finance-settings.md), and [Expense tax/receipt details](docs/expense-tax-receipts.md)
- [Bills & Installments domain](src/domain/obligations/README.md) and [tracking UI](src/features/obligations/README.md)
- [Reporting engine](docs/financial-reporting-engine.md) and [historical preservation baseline](docs/installment-payment-safety.md)
