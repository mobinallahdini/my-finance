# Optional Expense tax and receipt details

The transaction amount remains the **total amount paid**, including any tax.
An Expense of 11,500 cents with 1,500 cents tax reduces available bank/cash funds
by 11,500 cents, increases credit-card debt by 11,500 cents, and contributes
11,500 cents to monthly expenses. Its derived subtotal is 10,000 cents. Tax is
never added to the transaction amount or deducted from expense reports.

## Model and validation

Only `ExpenseTransaction` has optional `taxAmountCents?: MoneyCents` and
`receiptNumber?: string`. Income and Transfer prohibit these properties in the
TypeScript model and at runtime, including properties explicitly set to undefined.

Tax, when present, must be positive safe integer cents and no greater than the
Expense total. Tax equal to the total is valid and produces a zero subtotal.
Blank editor/CSV tax persists as an absent property. Zero is invalid.
Subtotal is derived as total minus tax and is never persisted. No country-specific
tax concepts, rates, automatic calculations, FX or tax-report semantics are added.

Receipt numbers are text, trimmed at the boundaries, with blank values removed.
Internal spaces, punctuation and Unicode are preserved. The maximum normalized
length is 200 JavaScript string code units, consistent with browser text length.
Numbers are not required and merchant receipt numbers need not be unique.
Invalid types and excessive length are rejected before persistence.

`validateTransaction` calls the shared Expense metadata validator. Repository
writes clone inputs, validate and normalize receipt metadata before the existing
atomic reference checks. Snapshot validation uses the same rules for JSON restore
and CSV import. No weaker UI-only rule is used and no new index or Dexie/database
schema version is needed. Database version remains 3.

## Editor, search and presentation

The single workspace uses the same Expense editor regardless of preserved internal
`profileType` metadata. New Expenses show a
secondary **Tax & receipt (optional)** disclosure, closed by default. Editing an
Expense containing metadata opens it automatically. It provides currency-aware
Tax / VAT and Receipt number labels, explanatory help, associated validation
errors and keyboard access. Invalid tax focuses its field; lowering the total
below tax blocks Save until corrected or removed. Metadata edits keep the ID.
Empty fields remove the properties.

A valid tax input reveals Subtotal, Tax / VAT and an emphasized Total in the
expanded section. No summary is shown without tax or for invalid tax/total.
The disclosure does not dirty a form by itself; metadata changes participate in
the existing unsaved-change guard. Switching new-entry type clears metadata and
Income/Transfer never show these fields. Hidden inputs do not trap keyboard focus.

Expense receipt numbers participate in existing case-insensitive text search.
Tax amounts do not participate in text search. Existing date, amount, category,
account and type filters retain their behavior. History, Home Recent Activity and
Account Details keep their compact rows and display only the total paid.

## JSON and CSV compatibility

Full Backup remains **schema version 3**. Expense fields are optional additive
properties, so earlier v3 files remain valid. V1/v2 files without these properties
restore normally; no fake tax or receipt metadata is synthesized. Current v3 and
Custom JSON preserve normalized tax/receipt fields along with existing workspace,
financial/tracking and appearance behavior. Validation completes before writes;
the existing six-store restore transaction and theme policy are unchanged.

The currency-aware Transactions CSV v2 gains two columns appended to its prior
schema, preserving the existing column positions:

```text
id,type,date,amount,currency_code,category_id,category_name,account_id,account_name,from_account_id,from_account_name,to_account_id,to_account_name,note,text_encoding,tax_amount,receipt_number
```

`tax_amount` is an exact two-decimal representation of integer cents in the
workspace currency and is blank when absent. `receipt_number` uses the same
apostrophe-based spreadsheet protection as other user text; import reverses this
protection before validation. Quoting handles commas, quotes and Unicode.
Income and Transfer export both columns blank; nonblank metadata on these types
is Invalid on import. Invalid tax/receipt rows are unselectable and never written.

The parser accepts complete current headers, previous currency-aware v2 headers
without both new columns, and legacy v1.0 `amount_cad` headers. Missing metadata
columns mean absent fields. Column order may vary; duplicate, unknown or incomplete
header sets remain rejected. The unchanged `text_encoding` marker describes text
protection, not the transaction schema version. Tax and receipt participate in
duplicate/conflict identity so an existing ID with different metadata is never
silently skipped as identical or overwritten.

File-wide currency safety, explicit reference mapping, Ready-row selection and
atomic batch import retain their existing policies. A batch containing invalid
metadata fails before any write. Accounts/Categories CSV and filenames are unchanged.
Older application versions that strictly recognize only the prior columns will
not import the extended CSV; use the updated application to read it.

## Scope and review choices

There is one workspace currency, compatible with the existing two-decimal model.
This feature stores descriptive metadata only. It does not provide rates, tax/VAT
reports, reclaim calculations, receipt images, attachments, OCR, merchant recognition,
charts, dependencies, cloud sync or multiple workspaces. Review the 200-character
receipt limit and the closed-by-default disclosure shared by both profiles.

## Files and verification

Created:

- `src/domain/expenseDetails.ts`
- `tests/expense-details.test.mjs`
- `tests/expense-details.browser.mjs`
- `docs/expense-tax-receipts.md`

Modified:

- `README.md`
- `docs/data-backup.md`
- `package.json` (new browser-test command only)
- `src/domain/models.ts`
- `src/features/dataBackup/transactionCsv.ts`
- `src/features/transactions/TransactionForm.tsx`
- `src/features/transactions/transactionFiltering.ts`
- `src/features/transactions/transactions.css`
- `src/persistence/repositories.ts`
- `src/persistence/snapshotValidation.ts`
- `src/persistence/validation.ts`
- `tests/data-backup.test.mjs`
- `tests/pwa.browser.mjs`

The focused unit suite proves validation boundaries, total-paid financial semantics,
v1/v2/v3 compatibility, exact tax and receipt exchange, formula protection,
currency handling, mapping and metadata-aware duplicate/conflict checks.
The focused browser suite covers add/edit/remove, both profiles and CAD/USD/EUR,
receipt search, direct repository rejection, batch rejection, actual JSON restore
and CSV import, reload persistence, accessible validation, keyboard disclosure and
compact presentation. Expanded editors are checked in Sage/Ocean/Dark at 320px,
390px and desktop, each at 100% and 200% text, with screenshots and no horizontal
overflow. Existing suites verify onboarding/settings, financial/tracking features,
themes, navigation, filtering and production/PWA behavior. The production suite
also round-trips tax/receipt metadata through v3 JSON and CSV while offline.

Run `npm test`, all seven `test:*:browser` / `test:obligations:ui` scripts,
`npm run build`, `npm run lint`, and `git diff --check`. Browser suites use Node 24
and Chrome's native DevTools protocol with isolated profiles and no dependencies.
`BILLS_APP_URL` selects a running Vite server for development browser suites.

Validation passed with Node 24.14.0 and Chrome:

| Command | Result |
| --- | --- |
| `npm test` | 358 passed (79 new focused unit tests) |
| `npm run test:obligations:browser` | 99 passed |
| `npm run test:obligations:ui` | 263 passed |
| `npm run test:backup:browser` | 184 passed |
| `npm run test:settings:browser` | 92 passed |
| `npm run test:workspace-backup:browser` | 48 passed |
| `npm run test:expense-details:browser` | 96 passed |
| `npm run test:pwa:browser` | 216 passed |
| `npm run build` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |

All 1,356 unit tests and browser checks passed. The new editor screenshots were
visually reviewed; the narrow header places its title above Cancel/Save so 200%
text does not squeeze the title into a tall column. Financial calculation files,
database schema, PWA source, Vite settings, dependencies and lockfile are unchanged.
Work remains uncommitted on `feature/v1.1-onboarding-currency`.
