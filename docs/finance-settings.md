# v1.1 onboarding and finance settings

This step adds preferences for one workspace. It adds no profiles, tax/VAT,
yearly reports, exchange rates, cloud services, or currency-specific account
fields. Existing financial and tracking calculations remain unchanged.

## Settings and persistence

Dexie schema 3 retains versions 1 and 2 verbatim and adds the
`applicationSettings` store with primary key `id`. The sole record is:

```ts
{
  id: 'application',
  countryCode: 'CA',           // ISO 3166-1 alpha-2
  currencyCode: 'CAD',         // supported ISO 4217 code
  profileType: 'personal',    // or 'business'
  fiscalYearStartMonth: 1,    // integer 1–12
  onboardingCompleted: true
}
```

Codes, field types, fixed ID, required fields, and unknown fields are validated
before writes and when reading persisted settings. Display labels are never stored.
All five existing data tables and indexes remain unchanged.

During a v1/v2 database upgrade, any record in Accounts, Categories, Transactions,
Obligations, or Obligation Payments causes exactly the legacy record above to be
added. This includes zero-balance accounts and tracking-only datasets. No financial
record, number, note, date, ID, reference, or theme preference is rewritten.
Bootstrap also covers a database populated before setup or an interrupted startup.
An empty installation leaves settings absent and requires setup.

## Startup and forms

The provider renders a loading state while reading storage, then either the main
application or a single setup form. It does not mount the main shell before setup
has completed. Read failures show a retry action instead of assuming CAD. Settings
are observed with Dexie liveQuery, including changes from another tab.

Setup requires Country / Region and an explicit Currency selection. A valid region
from browser locales is an editable suggestion only; locales without a region
leave the country unselected. Currency is independent and starts unselected.
Personal and January are the default metadata choices. More → Finance settings
opens a separate destination containing the same four editable preferences.

The country catalog contains 249 ISO 3166-1 alpha-2 codes. Intl.DisplayNames supplies
readable country/currency names; browsers without it retain usable code labels.
No external requests or new dependencies are used by the selectors.

Currencies come from the ISO 4217 maintenance agency's
[SIX List One](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html),
retrieved October 5, 2026, restricted to minor unit 2 and excluding non-circulating
fund codes. The static catalog keeps validation consistent across browser versions.
CAD, USD, EUR, GBP, IRR, TRY, and AED are supported; zero-decimal JPY and
three-decimal KWD/BHD are excluded. Monetary values remain safe integer minor units
with exactly two decimal places. IRR follows ISO's two-decimal definition even
when a browser's default currency formatting would omit fractional digits.

Personal / Business describes the current single workspace. It creates no new
dataset or tax behavior. Fiscal start month is saved for future annual/fiscal
reporting and does not change calendar-month totals or obligation due months.
Theme remains separate under the existing localStorage key and Sage default.

## Currency safety and presentation

Changing currency with any persisted financial/tracking record requires a native,
keyboard-accessible confirmation:

> Changing currency changes how existing amounts are labeled and formatted. Existing values will not be converted.

Cancel writes nothing. Confirmed writes change only settings. The old-currency
confirmation token and data-presence check are revalidated under a transaction
over all six stores, preventing a concurrent data/settings change from silently
bypassing the warning. No conversion or rounding of stored numbers occurs.

`formatMoney` caches Intl.NumberFormat instances by currency/locale and uses
BigInt/formatToParts to preserve fractional cents even at the safe-integer boundary.
English UI uses `en-CA` formatting for continuity; country does not force a locale
or currency. `useMoney` accesses the current currency through the provider.
Financial calculations do not depend on React or settings.

Active currency reaches Home totals/aria labels/category spending/recent activity,
Upcoming payments, transaction history/editors/status/delete confirmations,
amount filters/chips, account list/details/opening-balance/credit-limit fields,
and bill/installment/payment amounts/editors/history/confirmations. Exact input
parsing is unchanged. CAD references remain only where explicitly required by
legacy migration, backup compatibility, and the legacy CSV format/preview.

## Backup and CSV work remaining

JSON schema remains v2. Full and Custom Backup write the active workspace currency
from the same read transaction as their data. V2 validation accepts supported
two-decimal codes; v1 retains CAD-only compatibility. Replacement restore applies
the backup currency atomically with all five data tables; failures roll back all
six stores. Preview and final confirmation explain the currency being restored.

Country, profile type, fiscal month, and onboarding metadata are not included in
JSON yet. Restore keeps the destination's country/profile/fiscal settings and
marks the workspace ready. The next backup step must define full settings backup
and restoration. Non-CAD v2 backups cannot be restored by the released v1.0 app.

Legacy CSV columns and bytes remain CAD-specific. All CSV import/export actions
are disabled with an explanation for non-CAD workspaces. Export checks persisted
currency with its snapshot, and transaction import checks it within its write
transaction. The next step must introduce currency-aware CSV metadata, headers,
validation and previews; no Bills & Installments CSV format is added here.

## Validation and review

Run `npm test`, `npm run build`, `npm run lint`, and `git diff --check`.
With Vite running, run all existing browser suites and
`npm run test:settings:browser` (Node 24 and Chrome; no automation dependencies).
`BILLS_APP_URL` overrides the default development URL. The settings suite uses an
isolated Chrome profile and seeds the actual released Dexie v2 schema, verifies
exact preservation of all five tables/theme, explicit first-run setup/reload,
settings edits/cancel/confirmation, active currency presentation, JSON metadata,
CSV gating, restore rollback, and recoverable startup failures.

The suites cover Sage/Ocean/Dark, 320px/390px/desktop, 200% text, native labelled
controls, keyboard order/visible focus, confirmations, and horizontal overflow.
Review screenshots are retained in the temporary `my-finance-settings-review-*`
directory. Existing PWA checks cover subdirectory/root hosting, offline navigation,
asset-only caching, update activation and record preservation. PWA logic is unchanged.


## Files in this step

### Created (12)

- [docs/finance-settings.md](../docs/finance-settings.md)
- [src/domain/financeSettings.ts](../src/domain/financeSettings.ts)
- [src/domain/financeSettingsCodes.ts](../src/domain/financeSettingsCodes.ts)
- [src/features/financeSettings/FinanceSettingsForm.tsx](../src/features/financeSettings/FinanceSettingsForm.tsx)
- [src/features/financeSettings/FinanceSettingsProvider.tsx](../src/features/financeSettings/FinanceSettingsProvider.tsx)
- [src/features/financeSettings/financeSettings.css](../src/features/financeSettings/financeSettings.css)
- [src/features/financeSettings/selectorLabels.ts](../src/features/financeSettings/selectorLabels.ts)
- [src/features/financeSettings/settingsContext.ts](../src/features/financeSettings/settingsContext.ts)
- [src/features/financeSettings/useMoney.ts](../src/features/financeSettings/useMoney.ts)
- [src/persistence/applicationSettings.ts](../src/persistence/applicationSettings.ts)
- [tests/finance-settings.browser.mjs](../tests/finance-settings.browser.mjs)
- [tests/finance-settings.test.mjs](../tests/finance-settings.test.mjs)
### Modified (40)

- [README.md](../README.md)
- [docs/data-backup.md](../docs/data-backup.md)
- [package.json](../package.json)
- [src/App.tsx](../src/App.tsx)
- [src/features/accounts/AccountBalances.tsx](../src/features/accounts/AccountBalances.tsx)
- [src/features/accounts/AccountForm.tsx](../src/features/accounts/AccountForm.tsx)
- [src/features/accounts/AccountsSection.tsx](../src/features/accounts/AccountsSection.tsx)
- [src/features/accounts/README.md](../src/features/accounts/README.md)
- [src/features/accounts/money.ts](../src/features/accounts/money.ts)
- [src/features/dashboard/DashboardSection.tsx](../src/features/dashboard/DashboardSection.tsx)
- [src/features/dashboard/README.md](../src/features/dashboard/README.md)
- [src/features/dashboard/RecentActivity.tsx](../src/features/dashboard/RecentActivity.tsx)
- [src/features/dashboard/UpcomingPayments.tsx](../src/features/dashboard/UpcomingPayments.tsx)
- [src/features/dataBackup/CsvImportPreview.tsx](../src/features/dataBackup/CsvImportPreview.tsx)
- [src/features/dataBackup/DataBackupSection.tsx](../src/features/dataBackup/DataBackupSection.tsx)
- [src/features/dataBackup/RestorePreview.tsx](../src/features/dataBackup/RestorePreview.tsx)
- [src/features/dataBackup/backupFormat.ts](../src/features/dataBackup/backupFormat.ts)
- [src/features/dataBackup/useDataBackup.ts](../src/features/dataBackup/useDataBackup.ts)
- [src/features/more/MoreSection.tsx](../src/features/more/MoreSection.tsx)
- [src/features/navigation/useAppNavigation.ts](../src/features/navigation/useAppNavigation.ts)
- [src/features/obligations/ObligationForm.tsx](../src/features/obligations/ObligationForm.tsx)
- [src/features/obligations/ObligationPaymentForm.tsx](../src/features/obligations/ObligationPaymentForm.tsx)
- [src/features/obligations/ObligationsSection.tsx](../src/features/obligations/ObligationsSection.tsx)
- [src/features/transactions/README.md](../src/features/transactions/README.md)
- [src/features/transactions/TransactionFilterPanel.tsx](../src/features/transactions/TransactionFilterPanel.tsx)
- [src/features/transactions/TransactionFilters.tsx](../src/features/transactions/TransactionFilters.tsx)
- [src/features/transactions/TransactionForm.tsx](../src/features/transactions/TransactionForm.tsx)
- [src/features/transactions/TransactionList.tsx](../src/features/transactions/TransactionList.tsx)
- [src/features/transactions/TransactionsSection.tsx](../src/features/transactions/TransactionsSection.tsx)
- [src/features/transactions/transactionFiltering.ts](../src/features/transactions/transactionFiltering.ts)
- [src/features/transactions/transactionPresentation.ts](../src/features/transactions/transactionPresentation.ts)
- [src/persistence/README.md](../src/persistence/README.md)
- [src/persistence/dataBackup.ts](../src/persistence/dataBackup.ts)
- [src/persistence/database.ts](../src/persistence/database.ts)
- [src/styles/controls.css](../src/styles/controls.css)
- [tests/data-backup.browser.mjs](../tests/data-backup.browser.mjs)
- [tests/data-backup.test.mjs](../tests/data-backup.test.mjs)
- [tests/obligations-ui.browser.mjs](../tests/obligations-ui.browser.mjs)
- [tests/obligations.browser.mjs](../tests/obligations.browser.mjs)
- [tests/pwa.browser.mjs](../tests/pwa.browser.mjs)

## Results on the feature branch

- Build, lint, and `git diff --check`: pass.
- Unit tests: 248 passed (211 existing checks plus 37 settings/currency checks).
- Persistence browser suite: 99 passed.
- Bills & Installments UI browser suite: 263 passed.
- Backup browser suite: 184 passed.
- Settings/onboarding/migration browser suite: 92 passed.
- Production/PWA browser suite: 214 passed, including offline Finance settings.

The settings suite includes screenshots for all three themes at 390px, and Dark
at 320px with 200% text. Review artifacts for this run are in
`C:/Users/Admin/AppData/Local/Temp/my-finance-settings-review-AFaNjM`.
The production run's artifacts are in
`C:/Users/Admin/AppData/Local/Temp/my-finance-pwa-review-4mhKGh`.
Chrome/Windows checks are automated and do not replace manual iOS/Android device
review. No dependencies were added; Node 24.14.0 was used. The branch remains
`feature/v1.1-onboarding-currency`, with no commit or release tag created.
