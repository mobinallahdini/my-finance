# Monthly dashboard

`DashboardSection` replaces the app placeholder. It is read-only and contains a
labelled native month selector plus Previous/Next and Refresh buttons. The default
month comes from the existing local calendar date helper, without UTC conversion.
Month values remain YYYY-MM. Navigation respects years 0001 through 9999, and
month selection is independent of transaction entry and persists during refresh.

`useMonthlyDashboard` queries `transactionsRepository.getForMonth(month)` and
loads current category names through `categoriesRepository.getAll()`. It calls
the existing `calculateMonthlyTotalExpenses`, `calculateMonthlyTotalIncome`, and
`calculateMonthlyExpensesByCategory` functions. Net cash flow is income minus
expenses in integer cents, derived in the hook with a safe-integer guard. No
Expense/Income filtering or monetary aggregation is implemented in JSX. Domain,
persistence, and account balances are unchanged.

Category spending uses the domain's ID-keyed map and resolves current persisted
names. Only categories with spending appear, sorted by descending cents then
ascending category ID for ties. Missing references display "Unknown category"
and a visible status warning; their spending still contributes to the totals.
Percentages are amount / total expenses * 100 and are rounded for display to at
most one decimal place. They are never inputs to monetary calculations, and
rounded shares may not add to exactly 100%. All money uses the existing exact CAD
formatter. Transfers are excluded by the domain functions from both totals, net
cash flow, and category spending.

The existing shared data-change event reloads the selected month after successful
transaction or category writes. Changes outside that month do not change the
selection. Each selection/refresh increments a request version. Results are
displayed only when both the month and version match, so old values disappear
immediately during loading and never appear as current after a failed read.
Effect cleanup ignores superseded reads, including rapid month changes. Refresh
can retry storage or safe-calculation failures. Empty months display zero totals
and a category empty state; income-only/transfer-only months have no expense rows.

The UI uses headings, labelled controls, a summary definition list, and a table
with column and row headers. Negative net cash flow has a minus sign and a text
explanation. Controls and long values wrap on narrow screens. No charts,
dependencies, persisted dashboard state, or new global state library are added.
