# Monthly dashboard

`DashboardSection` is the Home destination. It is read-only and contains a compact
Previous / readable month / Next navigator. The month button reveals a labelled
native month input; Refresh / Retry appears only when loading fails. The default
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

The same monthly transaction read supplies Recent Activity. The latest three
records use the history page's existing `compareTransactions` comparator: date
descending, then ID ascending for ties. No creation timestamps are inferred.
Account names come from `accountsRepository.getAll()` in the same refresh cycle.
An account-name read failure shows a separate activity error/retry and safe
Unknown account labels; it does not suppress the financial summary. Missing
category names use Unknown category. Month/version guards apply to activity as
well as the summary, so activity from a previous month never remains visible
during a new month's read.

`RecentActivity` reuses the central workspace-currency formatter and transaction type labels.
Expenses display a minus sign, income a plus sign, and transfers an unsigned
amount with From / To direction (also expressed in screen-reader text). These
are presentation signs only: stored amounts remain positive cents. Transfers
appear in activity while remaining excluded from the financial summary and
category spending. Notes are omitted. Empty months get a compact message, and
View all transactions uses the existing `#transactions` navigation.

Category spending uses the domain's ID-keyed map and resolves current persisted
names. Only categories with spending appear, sorted by descending cents then
ascending category ID for ties. Missing references display "Unknown category"
and a visible status warning; their spending still contributes to the totals.
Percentages are amount / total expenses * 100 and are rounded for display to at
most one decimal place. They are never inputs to monetary calculations, and
rounded shares may not add to exactly 100%. All money uses the central exact workspace-currency
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

The UI uses headings, labelled controls, and summary definition lists. Net cash
flow is the primary value; income and expenses are supporting values. Positive
net cash flow has a plus sign; negative net cash flow has a minus sign and a text
explanation. Home has no enclosing feature-card border or shadow.

Category spending is a semantic list of compact rows with exact workspace-currency amounts,
text percentages, and decorative CSS bars hidden from assistive technology.
Bars clamp display width to 0–100% and never participate in calculations. The
first five sorted categories are shown initially. If more exist, Show all / Show
less exposes `aria-expanded` and `aria-controls`. No category data is discarded;
the unknown-category warning considers the complete list even when collapsed.
Changing months resets expansion. Shares may not add to 100% after rounding.

Income and expenses stack below 22rem. Long names and values wrap without
truncation. Selected month and expansion are local Home state and reset when
leaving Home or reloading. No charts, dependencies, persisted dashboard state,
or new global state library are added.

The polish pass removes the Home subtitle and calendar icon from the month
title. The native input remains available through the labelled month button.
Net cash flow retains the hero hierarchy; income and expenses occupy quiet
secondary surfaces. Category bars use 8px tracks with rounded ends and keep their
exact amount and percentage text. At 64rem and wider, the financial summary
aligns its secondary metrics alongside the hero, with spending and activity in
two balanced columns below. Mobile retains the vertical composition.

Polish validation: build, lint, whitespace check, and 98 isolated Chrome checks
at 320, 390, 1280, and 1440px, including selected-month activity, deterministic
ties, signed display with positive stored cents, transfer direction, empty
months, unchanged calculations, account-name recovery, focus/navigation,
horizontal overflow, and bottom-navigation clearance. A 200% text-size check
also passes. Review fixtures are confined to a disposable browser profile.
