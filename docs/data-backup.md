# Data & Backup - JSON schema version 3

More -> Data & Backup reads and writes files entirely in the browser. Nothing is
uploaded. Financial, tracking and workspace settings are stored in IndexedDB
`my-finance`, still at Dexie schema 3. File schema version is independent of the
database version. Theme stays under `my-finance-theme` in localStorage.
Files contain private financial information and are not encrypted. Store them
securely; clearing browser/site data may erase the local workspace.

## Full Backup JSON

New exports use schema 3 and include all six stores, plus appearance:

```json
{
  "format": "my-finance-backup",
  "schemaVersion": 3,
  "exportedAt": "2026-10-05T14:32:00.000Z",
  "currency": "CAD",
  "kind": "full",
  "sections": ["accounts", "categories", "transactions", "obligations", "obligationPayments", "applicationSettings", "preferences"],
  "data": {
    "accounts": [],
    "categories": [],
    "transactions": [],
    "obligations": [],
    "obligationPayments": [],
    "applicationSettings": {
      "id": "application",
      "countryCode": "CA",
      "currencyCode": "CAD",
      "profileType": "personal",
      "fiscalYearStartMonth": 1,
      "onboardingCompleted": true
    }
  },
  "preferences": { "theme": "sage" }
}
```

The metadata `currency` comes from `applicationSettings.currencyCode`; validation
rejects contradictory values. Country, currency, Personal/Business, fiscal month,
and the saved onboarding flag are serialized exactly. No editor state, route,
search, filters, calculated balance, principal, status, progress, or due date is
serialized. All financial/tracking record shapes, IDs, dates, notes, references
and safe integer minor units remain unchanged. There is no exchange conversion.

`exportedAt` is an ISO UTC timestamp with milliseconds. Export reads all six
stores under one transaction, so values and settings cannot come from different
workspace states during another tab's edits. Full Backup remains the canonical
recovery format. JSON never converts integer minor units into floating numbers.

The settings validator checks fixed ID, standardized country/currency codes,
Personal/Business, integer fiscal month 1-12, boolean completion and unknown
fields. Existing graph validation still rejects missing sections, duplicate IDs,
unsafe/fractional/nonpositive amounts, invalid calendar dates, orphan references,
category type mismatches, Income into credit cards, invalid Transfer endpoints,
and invalid bill/installment/payment shapes. Tracking history preserves archived
obligations, deliberate overpayments and paid dates separate from due months.
Both complete graphs and settings validate before any write. Themes are limited
to Sage, Ocean and Dark. Unsupported file schema versions are rejected.

## Compatibility with versions 1 and 2

Valid Full Backups and complete Custom Backups from both formats remain accepted.
Partial graph restores remain rejected. Preview explains reconstructed preferences.

- Version 1 is CAD-only. Its original accounts/categories/transactions graph is
  retained; obligations and payments are replaced with empty arrays. Settings
  become CA/CAD/personal/January/completed, independent of the destination's region.
  Preview and final confirmation warn that all current tracking data is removed.
- Version 2 restores all five financial/tracking tables and its supported currency
  metadata. If settings were not stored, currency becomes the file currency,
  profile becomes Personal, fiscal start becomes January, and setup is completed.
  Country uses the destination's already-selected Country / Region, since currency
  does not identify residence. A programmatic restore without a known destination
  region uses CA as a documented fallback. Preview shows the effective region and
  explicitly explains the reconstructed defaults.
- An optional settings record in v2 is accepted only after the same settings
  validation and matching-currency check. Valid stored preferences are preserved.

Restoring a valid workspace completes setup, so no format requires blocking
onboarding afterward. V3 export/validation preserve a boolean false completion
flag if one is supplied programmatically; restoring it marks completion true as
part of successfully recovering the workspace. Normal app exports always have
completed settings because Data & Backup is behind onboarding.

V3 files require this application version; the released v1.0 reader supports
only its older formats. Non-CAD v2 backups also require a currency-aware reader.

## Custom JSON policy

Every Custom Backup includes the exact application settings and matching currency
as structural interpretation, even a Categories-only or Preferences-only export.
Settings have no removable checkbox; the UI explains their automatic inclusion.
Appearance remains optional under Preferences. At least one selectable section
is required, preserving the existing selection policy.

Transactions automatically include all Accounts and Categories. Bills &
Installments always includes both obligations and recorded payments, preventing
orphan references. Full restore accepts a Custom Backup only when every section
for its version is included (seven in v3, six in v2, four in v1) and every Full
Backup validation rule passes. Partial Custom Backups are export-only.

## Atomic replacement restore

File selection, parsing and preview perform no writes. The preview shows readable
Country / Region, currency, profile, fiscal month, creation time, entity counts,
theme, current local counts and replacement mode. The final action requires an
explicit native confirmation. Cancel preserves every record, setting and theme.
There is no merge mode.

The copied, fully validated workspace replaces Accounts, Categories, Transactions,
Obligations, Obligation Payments and Application Settings in **one** IndexedDB
read/write transaction. All six stores commit together or all clears/writes roll
back. Settings are replaced completely, with the fixed application ID. No normal
account/category/history protection rule is changed outside this replacement
operation. Financial calculations remain derived and unchanged.

After successful database commit, the existing theme mechanism applies and
persists appearance. localStorage cannot participate in IndexedDB rollback. If
its write fails, financial/tracking/settings restoration stays successful, theme
applies for the session, and the result states the preference could not be saved.
It does not report that database restoration failed.

The existing refresh event rereads mounted financial/tracking features; Dexie
liveQuery updates the settings provider. Country, currency, profile and fiscal
preferences, money formatting and theme update without requiring reload.

## Currency-aware CSV schemas

Transactions CSV v2 uses these columns:

```text
id,type,date,amount,currency_code,category_id,category_name,account_id,account_name,from_account_id,from_account_name,to_account_id,to_account_name,note,text_encoding
```

Each nonblank row has the same validated, supported `currency_code`, taken from
the workspace settings in the export snapshot. It is plain uppercase ISO metadata
such as CAD, USD or EUR. CSV currency is file interpretation only; no currency is
added to domain transactions or accounts. No FX conversion is offered.

Accounts CSV now uses:

```text
id,name,type,opening_balance,credit_limit,currency_code,text_encoding
```

All monetary records use current workspace currency. Opening balances may be
negative; credit limits are nonnegative and blank when absent or inapplicable.
Accounts CSV import remains unsupported.

Categories CSV has no monetary values and remains byte-for-byte unchanged:

```text
id,name,type,text_encoding
```

Categories CSV import remains unsupported. No Bills & Installments CSV is added.

CSV is UTF-8, with all fields quoted, embedded quotes doubled and CRLF separators.
Decimal amounts use the existing exact BigInt helpers: `42.75`, `2000.00`,
`-123.45`. There is no floating storage or numeric conversion between currencies.
Symbols, grouping commas, exponents and more than two decimal places are rejected.
Only supported two-decimal currencies are accepted. JPY-style zero decimal and
KWD-style three decimal interpretation are not implemented.

The unchanged `text_encoding` marker is `my-finance-apostrophe-v1`. Every nonempty
user text field (IDs, names, type, dates, notes) gets one apostrophe prefix before
CSV quoting. Import removes exactly one. This protects formula-like text and
preserves original apostrophes, whitespace, commas, quotes, multiline notes and
Unicode. Generated money, validated `currency_code`, and the fixed encoding marker
have no apostrophe prefix. They cannot contain user-supplied formulas. Spreadsheet
modes may display the text apostrophe literally; do not remove it for re-import.

Transactions retain date-descending, ID-ascending order. Expense/Income populate
account/category fields; Transfer uses From/To fields; unused columns stay blank.
IDs retain identity and names assist inspection/mapping. Column order may vary
on import; duplicate, missing and unknown columns are rejected.

## Legacy CSV and currency checks

Legacy Transactions CSV v1 uses `amount_cad` and has no `currency_code`. All its
original columns and encoding marker remain required. Import normalizes it to
`amount` with implied CAD, then applies the exact same workspace-currency check.
Legacy CAD CSV is allowed in CAD workspaces and blocked in USD/EUR workspaces.

A mismatch blocks preview/import with a clear message:

> This file uses USD, but this workspace uses CAD.

Mixed row currencies and missing/unsupported codes reject the entire file,
including when the mismatched row has other invalid fields. CSV import never
changes workspace settings or currency. Currency can be changed separately in
Finance settings only with the existing safety behavior.

A header-only file is valid and contains no transactions or amounts to interpret;
per-row currency metadata is absent when there are no rows. Its empty preview has
no importable selection. This convention does not infer or change currency.

An optional UTF-8 BOM, quoted commas, escaped quotes, multiline fields, LF/CRLF
records and blank rows are supported. Malformed quoting rejects the file.
Other malformed records get a visible Invalid status. This importer accepts the
My Finance schema, not arbitrary bank-statement formats.

## Transaction preview and import rules

- Ready: valid, selected by default and optionally deselected.
- Duplicate: effectively identical existing ID or repeated file row; skipped.
  Empty and absent notes compare equally. Other note whitespace, dates, amounts,
  types and references are exact. Display names do not affect equality.
- Conflict: same ID with different or unresolved data; never overwritten/imported.
- Needs mapping: references cannot be uniquely resolved.
- Invalid: malformed fields or financial/reference validation fails.

Exact persisted IDs take precedence. Failing that, names use trimmed,
case-insensitive matches only when unique; categories also require the right
Expense/Income type. A matching category ID with the wrong type is Invalid.
Ambiguous names are never guessed. Explicit mappings target existing entities;
no accounts/categories or transaction IDs are manufactured. Income cannot target
credit cards; Transfer endpoints must differ. Existing business rules are reused.

Preview uses file currency for exact amounts, status filtering and 20-row pages.
Only selected Ready rows are submitted. If workspace currency changes while the
preview is open, a blocking message appears and import is disabled. Before writes,
selected records are copied and validated again against current accounts,
categories, IDs **and workspace currency** under one IndexedDB transaction.
A stale reference, ID collision, currency mismatch or bulk-write failure rejects
all additions. Existing records and settings are never overwritten by CSV import.
The preview stays open for review and result text reports imported/skipped counts.

## Filenames, limitations and validation

Filename conventions are unchanged: `my-finance-backup-YYYY-MM-DD.json`,
`my-finance-custom-backup-YYYY-MM-DD.json`, and
`my-finance-{transactions|accounts|categories}-YYYY-MM-DD.csv`, using local dates.
No currency is added to filenames. Downloads remain local Blob URLs, revoked
after use; PWA caching remains restricted to application assets.

There is one workspace currency, no FX conversion, account/transaction currencies,
multiple workspaces, tax/VAT, charts, cloud sync, merge restoration, encryption,
or entity CSV imports. PWA logic, theme keys and financial calculations are unchanged.

Run `npm test`, `npm run build`, `npm run lint`, and `git diff --check`.
Run all existing browser suites plus `npm run test:workspace-backup:browser`
with Vite running. Node 24 and Chrome are used without automation dependencies.
`BILLS_APP_URL` and `CHROME_BIN` override the development URL/browser.
The new suite checks v3 downloads, USD CSV, mismatch/mixed/legacy behavior,
settings/formatting updates, native cancel/confirm, six-store rollback, actual
settings-write failure, theme-storage failure, v1/v2 defaults, all themes,
320px/390px/desktop and 200% text. Production PWA tests exercise offline v3
restore/current CSV import, hosting paths, asset-only caching and safe updates.

## Implementation file inventory and validation

Created:

- `tests/workspace-backup.test.mjs`
- `tests/workspace-backup.browser.mjs`

Modified:

- `README.md`
- `docs/data-backup.md`
- `docs/finance-settings.md`
- `package.json` (browser test command only; no dependency changes)
- `src/domain/financeSettings.ts`
- `src/features/dataBackup/CsvImportPreview.tsx`
- `src/features/dataBackup/CustomExport.tsx`
- `src/features/dataBackup/DataBackupSection.tsx`
- `src/features/dataBackup/RestorePreview.tsx`
- `src/features/dataBackup/backupFormat.ts`
- `src/features/dataBackup/transactionCsv.ts`
- `src/features/dataBackup/useDataBackup.ts`
- `src/persistence/README.md`
- `src/persistence/dataBackup.ts`
- `src/persistence/snapshotValidation.ts`
- `tests/data-backup.browser.mjs`
- `tests/data-backup.test.mjs`
- `tests/finance-settings.browser.mjs`
- `tests/finance-settings.test.mjs`
- `tests/obligations.browser.mjs`
- `tests/pwa.browser.mjs`

Validation passed using Node 24.14.0 and Chrome:

| Command | Result |
| --- | --- |
| `npm test` | 279 passed |
| `npm run test:obligations:browser` | 99 passed |
| `npm run test:obligations:ui` | 263 passed |
| `npm run test:backup:browser` | 184 passed |
| `npm run test:settings:browser` | 92 passed |
| `npm run test:workspace-backup:browser` | 48 passed |
| `npm run test:pwa:browser` | 214 passed |
| `npm run build` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |

The 1,179 unit tests and browser checks include existing financial, tracking,
onboarding, theme, navigation, transaction filtering and production offline
regressions. No financial calculation, database schema, PWA source, Vite setting,
dependency or lockfile changes are included.
