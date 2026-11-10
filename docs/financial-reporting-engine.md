# Financial reporting engine (v1.3 milestone 2)

This milestone is pure computation over existing Account, Category, and Transaction
records. It adds no screen, navigation, exports, persistence, schema, migration,
installment linkage, receipt images, or dependencies. Nothing reads or writes
IndexedDB in these modules. The caller supplies one coherent data snapshot.

## API

```ts
import { createReportFilters } from '../src/domain/transactionQuery'
import { prepareFinancialReport } from '../src/domain/reporting'

const filters = createReportFilters({
  dateMode: 'range', fromDate: '2026-10-01', toDate: '2026-10-31',
  types: ['expense', 'refund'], accountTypes: ['bank', 'credit_card'],
})
const report = prepareFinancialReport({
  accounts, categories, transactions, filters, grouping: 'category',
})
```

`ReportQuery` uses the existing domain records and validated filters.
`PreparedReport` contains the copied filters, grouping mode, source and matched
transaction counts, normalized rows, a global `FinancialSummary`, and groups.
Default grouping is `none`. Default report filters select all dates and types;
they do not read a clock. Transactions history retains its existing current-month
default, filter panel, search, chips, and session behavior.

`createReportFilters` accepts optional criteria and fills defaults.
`validateTransactionFilters` validates a complete existing filter state.
Both return a detached, frozen `ValidatedTransactionFilters`. The report entry
point validates again rather than trusting a TypeScript brand at runtime.

The result is deeply frozen, JSON-compatible, and detached from caller objects.
It contains no Maps, timestamps, functions, or stored balance snapshots. Mutating
source records or filter selections after preparation cannot change a report.
The engine never freezes or sorts the caller's objects/arrays.

## Financial definitions

All monetary fields are integer cents in the current workspace currency.
Formatting belongs to the existing currency layer. There is no CAD assumption,
FX conversion, or account-specific currency.

| Summary field | Definition |
| --- | --- |
| `grossExpensesCents` | Sum of Expense amounts |
| `refundsCents` | Sum of Refund amounts, as a positive volume |
| `netExpensesCents` | Gross Expenses minus Refunds |
| `totalIncomeCents` | Sum of Income amounts |
| `netCashFlowCents` | Total Income minus Net Expenses |
| `transferVolumeCents` | Sum of Transfer amounts, once per source transaction |

The summary also includes total and per-type transaction counts. Refund is not
Income; Transfer is neither Income nor Expense. Tax is already included in an
Expense's amount and is never added again. Refund-only and negative-net periods
remain valid. Each record, accumulation, and produced monetary result must be a
safe integer; unsafe results fail with `RangeError` instead of rounding/clamping.

**Net Cash Flow preserves Home's existing reporting definition.** It includes
card purchases and excludes Transfers. It is not necessarily a selected bank's
balance movement. Account opening balances, debt signs, available credit, and
credit-card payment semantics have not changed.

`financialSummary.ts` owns the shared reducer. Its full scope produces report
metrics; restricted Expense/category and Income scopes back the existing monthly
APIs in `calculations.ts`. Home uses the shared checked `calculateNetCashFlow`.
The legacy APIs retain their exact relevant-type filtering, signed category
accumulation order, and overflow boundaries. For example, cancelling transactions
can have a representable net Expense but an unrepresentable gross Expense total.
The legacy net-only API still succeeds in that case; a full report rejects its
unsafe gross metric. Home does not acquire a dependency on Transfer/gross totals.

## One shared filtering engine

`transactionQuery.ts` provides the predicate used by Reports and re-exported at
the existing feature-level `transactionFiltering.ts` path. Matching preserves
input order and transaction references. Only prepared reports sort the matches.
Presentation-specific draft amount parsing, validation messages, and chips remain
in the feature module. Calendar checks reuse the domain calendar validators.

- AND across groups; OR within each selection.
- Month, custom range, and all-dates modes retain existing meanings. Inactive
  date criteria do not restrict results. Set `dateMode: 'range'` for date bounds.
- Custom start/end dates are inclusive; either/both may be empty for an open
  range. Invalid dates, year zero, invalid leap days, and reversed ranges fail.
- Amount bounds are inclusive, non-negative safe integer cents, matched against
  the stored positive amount regardless of its displayed sign.
- Empty account/category/account-type selections are unrestricted. Empty
  transaction-type selection means zero matches.
- Account matching includes both Transfer endpoints. Categories exclude
  Transfers when a category selection is active.
- Account and account-type restrictions must both match the **same** endpoint.
  Bank A -> Card B cannot match Account Bank A plus Type Credit Card. An empty
  intersection is zero matches, never an unrestricted account selection.
- Search trims surrounding whitespace and matches case-insensitive substrings
  of type labels, current account/category names, either Transfer endpoint name,
  note, and Expense receipt number. It retains the history fallback labels for
  unavailable references. No tokenization or merchant inference is introduced.

Dates remain YYYY-MM-DD calendar strings, years 0001-9999. Filtering and grouping
perform no Date construction, UTC conversion, timezone conversion, or fiscal-year
reinterpretation.

## Rows and validation

Each normalized row preserves source `id`, `date`, `type`, and `amountCents`.
Account/category snapshots include their actual IDs, current names and types.
Transfers have real `fromAccount` / `toAccount` snapshots; their singular
`account`, `accountType`, and `category` are null. Each endpoint carries its own
account type. Categorized rows have their stored account/category and null
Transfer endpoints. No external merchants, employers, senders, or counterparties
are invented.

Note and optional Expense tax, subtotal, and receipt fields use null when absent
or inapplicable. Missing tax is not a recorded zero; subtotal is derived only
when tax is supplied, through the existing `expenseSubtotal` helper. Zero subtotal
is valid when the included tax equals the total.

Inputs are existing domain records, not an alternative import/restore format.
The report boundary rejects duplicate/blank source IDs, invalid transaction
dates/amounts, malformed transaction endpoints, and invalid Expense details.
Missing account/category references remain visible under their original IDs,
with `isUnknown: true`, a clear unavailable label, and a null unknown type. A
missing account cannot satisfy an account-type restriction. Reports do not
repair records or reclassify historical Income/card records. Persisted write and
restore reference policies remain in persistence and are untouched.

## Grouping and ordering

Global rows, summary, counts, and every group derive from exactly one filtered
set. Global rows are date-descending, then source ID ascending. Groups contain
ordered `transactionIds` referencing those rows, not duplicate row objects.
Empty groups are omitted.

| Grouping | Keys and order | Membership |
| --- | --- | --- |
| `none` | No groups | Global rows only |
| `type` | `type:<type>`; Expense, Income, Transfer, Refund | One group per transaction |
| `category` | `category:<id>` ascending, then `transfers` | One group; Transfers bucket has null category |
| `month` | `month:YYYY-MM` descending | Stored calendar month, including the Refund's own date |
| `account` | `account:<id>` ascending | One normal account, or both actual Transfer endpoints |

Sorting uses code-unit comparisons with stable IDs, not locale-sensitive names.
Renames update snapshot labels without merging or reordering groups by name.
Category groups retain signed negative net spending. The Transfers bucket is
structural, so a real category ID/name `transfers` cannot collide with it.

An account group's `summary` describes its member transactions. Its separate
`transferInCents` and `transferOutCents` are positive endpoint volumes, not balance
changes or additional Expenses. They do not invert for a credit-card account.
There is no new account-balance calculation in grouping.

**Account groups are not additive for transaction counts or Transfer Volume.**
A Transfer is a member of two account groups while appearing once globally.
The engine calculates the global summary from unique filtered records, never
from group summaries. Filters select transactions, not endpoint labels: if Bank A
matches a Transfer, both Bank A and its actual other endpoint remain available in
account groups, but unrelated transactions of the other account remain excluded.

## Complexity and validation

Lookup uses account/category Maps and selection Sets. Preparation is
O(accounts + categories + transactions log transactions + groups log groups),
plus filter-selection sizes, with linear memory. Group reductions visit at most
twice the matching records for account grouping. Entity snapshots are cached and
shared as frozen objects, avoiding a linear entity search or full source copy
for each row. No storage indexes or dependencies are added.

`tests/reporting.test.mjs` covers all metrics, type/date/refund/tax semantics,
shared filters and same-endpoint intersections in both directions, normalization,
grouping, ordering, missing references, immutable snapshots, overflow, exact v1.2
Home/account fixtures, legacy exceptional behavior, and a 100,000-transaction /
2,000-account/category history. The large-history check has no flaky timing gate.
`npm test` includes it automatically. Existing browser suites verify the rendered
Home, Transactions filtering, accounts, backup compatibility, obligations, and PWA.
