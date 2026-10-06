# My Finance v1.2.0

Release candidate; feature work is frozen. Prepared on
`feature/v1.2-transaction-improvements` from clean feature commit `bbe022d`
(Refunds and inline categories), with the actual released `v1.1.0` tag as the
upgrade baseline (released commit `ea7848a`). Package and lockfile root metadata
are 1.2.0. Dependency versions,
database schema/indexes, deployment and PWA source remain unchanged.
No commit, merge, tag or push is part of this preparation.

## Highlights and scope

- Refund transactions, including merchant refunds to credit cards.
- Refund-adjusted monthly spending and category totals.
- Inline category creation inside Expense, Income and Refund editors.

These are the only new features. Refund is not Income. Income still cannot target
a credit card; credit-card payments remain Transfers. Refund can target bank,
cash or credit card and uses an Expense category. There is no original Expense
linking, automatic tax adjustment, chargeback/cashback support, FX conversion or
multiple workspaces. The app continues to have one workspace.

## Local data and backup

My Finance is local-first. Data stays in this browser on this device; installation
does not create cloud synchronization. Clearing site/browser data may erase it.
**Export a Full Backup before upgrading and keep it securely.**

Full Backup remains schema v3. Refund IDs, integer cents, calendar dates, notes,
accounts and Expense category references round-trip together with every existing
account/category/transaction, Bill/Installment/payment, setting, included tax,
receipt and theme. Restore remains an atomic replacement.

Valid pre-Refund backups in v1, v2 and v3 remain accepted, with the existing
settings reconstruction/currency policies. New files containing Refund require
a refund-aware reader: v1.1 and earlier reject that transaction type even though
the backup schema remains v3. This is forward-reader compatibility, not loss of
legacy restore support. No database migration is needed for Refund.

Transactions CSV keeps its current columns and uses `type=refund`, workspace
currency, Expense category and destination account ID/name, amount and optional
note. Transfer endpoint, tax and receipt columns are blank for Refund. Import
validates references and supports credit cards. Duplicate/conflict handling,
explicit mapping, formula protection, currency checks and atomic imports remain
in place. Earlier neutral-amount and legacy CAD CSV files remain compatible.

## Financial and chart behavior

Amounts are positive safe integer cents. Refund direction comes from its type:

| Scenario | Expected result |
| --- | --- |
| Bank/cash: 1000 opening, 100 Expense, 25 Refund | 925 available balance |
| Card: zero opening debt, 100 Expense, 25 Refund | 75 debt |
| Card: return the remaining 75 | Zero debt |
| Card: another 10 returned | 10 account credit; available credit can exceed the limit |
| Month: 100 Expenses, 25 Refunds | 75 net Expenses; Income unchanged |
| Month: no Expenses, 100 Refunds, no Income | -100 Expenses and +100 Net Cash Flow |
| September 100 Expense, October 25 Refund | September stays 100; October has -25 Expenses |

Credit-card payments still reduce bank funds and card debt as Transfers. Credit
limit, opening balance and historical transactions are not rewritten. Tax-bearing
Expense amount remains the authoritative total paid; Refund subtracts its own
amount separately without altering that Expense's tax or receipt.

Category totals remain signed. The donut omits zero/negative category nets and
uses the sum of positive nets for slices and percentages. If that sum differs
from net Expenses, the center says **Chart total** and accompanying text shows
the chart total, net Expenses and excess refund amount. A refund-only month has
no donut and explains its negative Expenses. A zero net month may still have a
positive chart if some categories are positive and others negative; the same
explicit explanation applies. No records or financial totals are clamped.
Other/Unknown grouping and the textual legend retain all positive chart cents.

## Inline category and accessibility behavior

Expense and Refund create Expense categories; Income creates Income categories;
Transfer has no category action. The compact flow reuses the existing shared
name validation: trim, reject empty/whitespace, reject case-insensitive duplicates
within a type, and allow the same name across Expense/Income.

Creating a category preserves amount/account/date/note/tax/receipt draft fields
and selects the new category. Cancel category/Escape preserves the transaction
draft; canceling the transaction afterward leaves the category saved. Shared
refresh updates Categories, filters and future editors.

Refund history, account activity and Home Recent Activity use explicit Refund
text, destination/category context and a plus sign. Type, account, category,
amount, date and search filters preserve their established AND/OR rules.

## Validation

The additional `npm run test:release:v12:browser` builds the actual `v1.1.0` tag
in a disposable directory, then serves released and candidate assets on the same
`/my-finance/` origin. It uses production UI and read-only native IndexedDB
inspection, with no development-module imports. Existing tests are retained.

The upgrade fixture contains recognizable Accounts/Categories, Expense/Income/
Transfer, Bills/Installments/payments, included Tax/VAT and receipt, DE/GBP/July
completed settings (including legacy internal business metadata), and Ocean theme.
Checks compare every record, settings/theme, schema/index and rendered dashboard/
account balance before and after activation, before any Refund is added.

The same suite covers CAD/USD/EUR/GBP Refunds, inline-category backup/CSV exact
round-trips, partial/full/over-refund balances and wording, cross-month/refund-only
Home, native arrow-key type selection, linked validation and focus restoration.
It exercises Sage/Ocean/Dark at 320px, 390px, desktop and 200% text, and starts
from an empty database using onboarding, accounts, inline Expense and card Refund.

It also verifies a later service-worker update waits for an unfinished Refund/
category draft and preserves all stored Refund/category references on activation
and offline reload. Creating a Refund and category offline is tested as well.
The manifest/icons, `./#home`, worker URL/scope and hashed assets retain project-path
behavior. Imported/exported financial files are not cached. Expected address:
<https://mobinallahdini.github.io/my-finance/>.

### Completed automated checks

Validated October 6, 2026 with Node 24.14.0 and desktop Chrome. All existing
suites ran; no tests were skipped. Browser fixtures/profiles are disposable and
do not modify a user's data. The added tests contribute 14 unit tests and 198
production browser checks. Download tests wait for Chrome's completion event
before reading exported files.

| Command | Passed |
| --- | ---: |
| `npm test` | 447 |
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
| `test:release:v12:browser` | 198 |
| **Total across 12 suites** | **2,467** |

Browser commands use `npm run`. This total comprises 447 unit tests and 2,020
named browser checks; assertions within a check and repeated development runs
are not counted separately. `npm run build`, `npm run lint` and
`git diff --check` pass, in addition to that total.

Existing suites verify strict repository/reference validation, Refund CRUD and
reload, deterministic history/filtering, reference protection, inline Expense/
Income/Refund creation and cancellation, category validation, legacy v1/v2/v3
restore, legacy CSV, atomic failure behavior and currency mismatch rejection.
Tax/receipt behavior, credit-card Transfers, obligation payments/progress and
Upcoming Payments all pass regression coverage. Production tests preserve the
actual released v1.1 data/settings/theme and show identical pre-Refund dashboard
and account amounts. Schema and indexes are identical; no migration was added.

Sage/Ocean/Dark pass at 320px, 390px and 1280px with normal and 200% text.
Checks cover overflow, navigation clearance, touch targets, native keyboard
Refund selection, visible focus, labelled inline fields, validation alerts,
dialog keyboard behavior and Escape focus restoration. These are desktop Chrome
viewport/text-size checks; they do not simulate a physical mobile keyboard.

### Findings and recommendation

- **BLOCKER:** none found. Refund direction, unchanged Income, signed Expenses,
  category geometry, exact backups/CSV and actual v1.1 upgrade all pass. No
  application fix or financial-semantic change was needed during RC preparation.
- **IMPORTANT BUT NON-BLOCKING:** physical iOS/Android installation, standalone
  launch, mobile keyboard and assistive-technology checks remain manual. Local
  production `/my-finance/` deployment was verified; this preparation does not
  publish to GitHub Pages or exercise the live Actions deployment. New Refund
  backups/CSV need a refund-aware app; older readers reject Refund, as documented.
- **MINOR / FUTURE:** at 320px with 200% text, long month labels and currency
  amounts wrap aggressively while remaining available through scrolling.
  Editing an account from Account Details emits a development React warning
  because AccountDetails and AccountForm sibling keys share the account ID;
  the exact same markup exists in released v1.1. Account edit/regression checks
  pass with no observed data failure. Existing layout and application code are
  preserved under feature freeze. Expense linking, automatic tax correction and
  multiple workspaces remain outside v1.2 scope.

**Recommendation:** ready for manual v1.2.0 release-candidate testing. Export a
Full Backup before upgrading. Complete physical-device checks before release.
No commit, merge, tag or push has been performed.

### RC preparation files

Modified: `package.json` (1.2.0 and production RC test command),
`package-lock.json` (root version metadata only), `README.md` (RC documentation
link). Created: `docs/release-v1.2.0.md`, `tests/release-v12.test.mjs`,
`tests/release-v12.browser.mjs`. Application source, financial/domain/persistence
behavior, dependencies, PWA and deployment configuration are unchanged.
