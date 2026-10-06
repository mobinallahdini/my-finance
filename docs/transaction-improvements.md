# v1.2 inline categories and Refunds

The editor offers Expense, Income, Transfer, and Refund. Editing keeps the type
fixed. Amounts remain positive safe integer cents; type determines direction.
No dependency, database version/index change, history rewrite, opening-balance
change, or multi-workspace behavior is introduced.

## Inline categories

`+ New category` opens an inline name, Save category, Cancel category flow. Expense
and Refund create Expense categories; Income creates Income categories; Transfer
has no category action. Type is inferred, never requested again.

Categories and the editor share `saveCategoryRecord` and `categoryNameError`.
Names are trimmed; empty names and case-insensitive duplicates within a type are
rejected. Expense and Income may share a name. Persisted names are rechecked on
save. Successful creation uses the existing shared refresh event, so Categories,
filters and subsequent editors see the result.

The transaction editor stays mounted. Amount, date, account, note, Tax / VAT,
receipt and other fields are preserved. A saved category is immediately selected,
including before the refresh read finishes. Cancel category and Escape preserve
the draft; Escape closes only the inline flow first. Enter in the name field saves
only the category. Transaction Save and type switching are unavailable while
creation is open. Category persistence is independent: canceling the transaction
afterward retains the saved category and leaves any original transaction intact.

## Refund semantics

Refund requires id, type `refund`, positive amount, calendar date, accountId and
categoryId. Note is optional. It has no tax or receipt metadata and must reference
an existing Expense category and bank, cash, or credit-card account.

| Destination | Refund effect |
| --- | --- |
| Bank or cash | Increases available balance |
| Credit card | Reduces debt; an over-refund may produce negative debt/account credit |

Refund does not become Income or Transfer. Income stays bank/cash only; card
payments stay Transfers. Available credit remains unclamped. History and account
activity show Refund with a plus sign and restrained action-token styling,
separate from Income. Home activity identifies Refund and its account. Type,
account, category, date, amount and text filters include Refund under existing rules.

## Month and chart policy

Monthly Expenses and category spending equal Expenses minus Refunds in the
selected month. Income excludes Refund. Net Cash Flow is Income minus these net
Expenses. Refund affects its own dated month; there is no linking or retroactive
edit. A September $100 Expense and October $25 Refund leave September Expenses
at $100, October Expenses at -$25, and October Income unchanged.

Financial totals may be negative and retain safe-integer checks. Only the donut
clamps category nets at zero and omits nonpositive slices. Its denominator is the
sum of positive category nets. When that differs from signed Expenses, the center
says **Chart total** and text explains the chart total, net Expenses, and excess
refund amount across negative categories. Refund-only months show an explanation
without a donut. Records and account calculations are never clamped or discarded.

## Persistence, backup and CSV

Repository add/update validate positive safe cents, calendar date, required
account/category, Expense category type, and absence of transfer/tax/receipt
fields. Generic accountId/categoryId/type indexes already support Refund.
Account/category deletion and type-change protections include refund-only references.

Full Backup remains v3. Refund and all existing records/settings round-trip
without transformation. Older v1/v2/v3 files without Refund remain valid. Files
containing Refund require a refund-aware app: released v1.1 and earlier cannot
read the new type. No backup format bump is needed.

CSV uses existing columns: `type=refund`, exact amount, currency_code, Expense
category ID/name, destination account ID/name, and optional note. Transfer, tax
and receipt columns are blank. Import allows credit-card Refunds, maps category
names against Expense categories and rejects Income-category Refunds/cross-type
fields. Missing references require explicit mapping. Currency guards, duplicate
and conflict handling, and atomic batch writes remain unchanged. Both older
neutral-amount and legacy CAD CSV schemas remain compatible.

## Validation

`npm test` covers balances, partial/full/over-refunds, negative and cross-month
Expenses, chart presentation, filtering, validation, backup and CSV round-trips.
`npm run test:transactions:browser` covers actual IndexedDB, draft and keyboard
behavior, Refund add/edit/delete, account/Home activity, downloaded Backup v3
restore and CSV import, reload and CAD/USD/EUR. It checks Sage/Ocean/Dark at
320px, 390px and desktop with 100% and 200% text. Existing browser suites,
production build, lint and diff checks also run.

Validated on `feature/v1.2-transaction-improvements`, starting from clean commit
`ea7848a`, using Node 24.14.0 and isolated Chrome profiles. Package version remains
1.1.0. No dependencies, lockfile changes, migrations, commits or tags were created.

| Check | Passed |
| --- | ---: |
| `npm test` | 433 |
| `test:obligations:browser` | 99 |
| `test:obligations:ui` | 263 |
| `test:backup:browser` | 184 |
| `test:pwa:browser` | 216 |
| `test:settings:browser` | 99 |
| `test:workspace-backup:browser` | 50 |
| `test:expense-details:browser` | 96 |
| `test:spending-donut:browser` | 107 |
| `test:release:browser` | 556 |
| `test:transactions:browser` | 152 |
| **Total distinct checks** | **2,255** |

Production build, lint and `git diff --check` pass. Existing production suites
check offline use, service-worker scope/cache/update behavior, financial record
preservation and upgrade from the actual v1.0.0 tag. Targeted transaction tests
were rerun after the final pending-category refresh adjustment. Review the signed
net Expense/positive-chart policy and the older-reader limitation above before
release. No functional blocker was found.

## File inventory

Created:

- `docs/transaction-improvements.md`
- `src/features/categories/categoryWrites.ts`
- `src/features/transactions/InlineCategoryCreate.tsx`
- `tests/transaction-improvements.test.mjs`
- `tests/transaction-improvements.browser.mjs`

Modified:

- `README.md`
- `docs/data-backup.md`
- `package.json` (adds the browser test command only)
- `src/domain/README.md`
- `src/domain/models.ts`
- `src/domain/calculations.ts`
- `src/persistence/README.md`
- `src/persistence/validation.ts`
- `src/features/categories/useCategories.ts`
- `src/features/transactions/README.md`
- `src/features/transactions/TransactionForm.tsx`
- `src/features/transactions/TransactionsSection.tsx`
- `src/features/transactions/transactionHelpers.ts`
- `src/features/transactions/transactionPresentation.ts`
- `src/features/transactions/transactionFiltering.ts`
- `src/features/transactions/transactions.css`
- `src/features/dashboard/README.md`
- `src/features/dashboard/DashboardSection.tsx`
- `src/features/dashboard/RecentActivity.tsx`
- `src/features/dashboard/useMonthlyDashboard.ts`
- `src/features/dashboard/spendingDonut.ts`
- `src/features/dashboard/SpendingDonutChart.tsx`
- `src/features/dataBackup/transactionCsv.ts`
- `src/features/dataBackup/CsvImportPreview.tsx`
- `src/styles/controls.css`
