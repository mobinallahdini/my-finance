# Financial Reports (v1.3 milestone 3)

More → Financial Reports opens `#more/reports`. It is a read-only view over the
existing ledger, with no report preference writes, schema or migration changes,
new transaction semantics, installment integration, OCR, or dependencies.
Milestone 4 adds read-only [CSV and native print/PDF exports](report-exports.md).

## Data and calculations

`useReportSnapshot` reuses `readFinancialSnapshot` from persistence. That existing
function reads Accounts, Categories and Transactions under one Dexie `r`
transaction. No persistence changes were necessary. The screen calls the
[milestone 2 engine](financial-reporting-engine.md), `prepareFinancialReport`,
and takes its summary, normalized rows, counts and group memberships from the
same `PreparedReport`. React formats these values without recalculating totals.

Loading and refresh hide the preceding result. Storage failures and calculation
failures show a recoverable alert with Refresh / Retry, rather than stale or
partial figures. An empty ledger differs from a zero-match filter result; both
have the engine's complete zero summary. A shared local `notifyDataChanged`
notification refreshes a mounted report. Otherwise Refresh rereads the snapshot.
There is no automatic cross-tab refresh claim.

The overview shows Total Income, Gross Expenses, Refunds, Net Expenses, Net Cash
Flow, Transfer Volume, and Matching transactions in the workspace currency. Tax
is already included in the Expense total. Negative net spending and refund-only
periods remain visible. A short explanation preserves Home's cash-flow meaning:
Income minus Net Expenses, including card purchases and excluding Transfers,
which is not necessarily a bank account's balance change.

## Filters and session state

The initial period is Current month. Current year uses January 1 through December
31; All time removes the date restriction while retaining other criteria. Custom
dates are inclusive, allow open bounds, use YYYY-MM-DD calendar strings, and apply
only after valid submission. Presets use local calendar fields, with no UTC or
fiscal-year reinterpretation.

The existing `TransactionFilterPanel` has an opt-in Reports mode. It adds Search
text and Account types while retaining its established date, type, account,
category, and exact amount controls. Existing Transactions behavior is unchanged.
Apply validates through the existing draft helpers and domain query validator;
Cancel/Escape discards the draft. Clear all filters inside the dialog clears only
the draft until Apply. The main Clear All action immediately removes every
restriction, including dates and search. Removable chips identify active groups.

Matching is delegated to the shared engine: AND between groups, OR within a
selection, with account and account-type restrictions on the same eligible
Transfer endpoint. No matching predicate exists in the Reports components.

Active filters, selected columns, grouping and group selection live in an
in-memory session store separate from Transactions. They survive client-side
navigation away and Back/Forward. Browser reload retains the hash route and
resets these controls to defaults. Nothing is written to IndexedDB or localStorage.

## Columns, grouping and pagination

Default columns are Date, Type, Category, Account and Amount. Columns provides all
twelve requested fields and Restore default columns. Amount is always present,
so deselecting every optional field still gives a meaningful report. Missing or
inapplicable metadata uses a dash; missing Tax/VAT is not displayed as recorded
zero. Transfer endpoints are the actual internal accounts, also shown in the
default Account cell. There are no invented merchants or counterparties.

Group by selects None, Month, Category, Account or Transaction Type. Select group
then chooses an engine-produced group. The group shows its engine summary and
member count. Global totals and matching count above always cover the complete
filtered set. Account grouping shows separate Transfer In / Transfer Out and
explicitly warns that group counts and Transfer volumes are not additive.

Rows are paginated at 25, including within a selected group. A Map resolves engine
member IDs to normalized rows; components never regroup the transactions. At most
25 desktop rows and 25 alternative mobile cards are mounted. Pagination and
column/group selection reuse the prepared report. Only new data, active filters,
or a grouping-mode change prepares it again. Pages reset when the underlying
report/group changes; summary totals never become page totals.

## Layout and accessibility

The screen follows existing theme tokens and shared controls. Desktop uses a
semantic table with labelled headers and a scrollable region for optional columns;
Amount stays pinned at its right edge. Below 1024px, labelled cards present all
selected fields without a wide table. Container queries give narrow/large-text
summary values and card headers more room. Values remain exact, including the
safe-integer boundary, rather than being abbreviated or clipped.

Filter and column controls have native labels and keyboard interactions. The
filter dialog contains Tab navigation, supports Escape even in its search field,
and restores its opener. Invalid dates identify and focus the correction. Page
changes focus the results heading and announce page/count status. Type labels,
signs and endpoint text convey meaning in addition to color.

The Reports content loads as a separate route chunk. `ReportsRoute` keeps its
heading mounted throughout loading, so client-side navigation does not lose its
focus target. The existing initial-load focus guard and four bottom destinations
are retained. Service-worker source and behavior are unchanged; the existing
build allowlist caches the new chunk with the rest of the application shell.

## Validation

Run `npm run build`, `npm run lint`, `npm test`, `git diff --check`, and
`npm run test:reports:browser`. The new browser suite starts its own local servers
and requires a production build, Node 24 and Chrome, without new automation
dependencies. It uses only a disposable browser profile.

The suite compares displayed values, source IDs and group metrics against the
real reporting engine. It covers navigation/history/deep links, presets/custom
dates, all filter groups, Apply/Cancel/Clear All, columns, all grouping modes,
refund/card/Transfer semantics, bounded pagination without repreparation, currency
formatting, read/calculation failures, local refresh notifications, and reload.
Read-only native IndexedDB snapshots compare all records, settings and indexes;
write interception verifies that Reports itself issues no store mutations.

Sage, Ocean and Dark run at 320px, 390px, 820px and 1280px with normal and 200%
text, including all optional fields and maximum-safe amounts. Production checks
cover both empty and populated Reports, deep-link reload and offline access to
the separate route chunk. Existing unit, navigation, financial, backup, obligation
and PWA suites remain part of regression validation.
