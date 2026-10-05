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

## Spending donut

Refund subtracts from its Expense category and month without increasing Income.
Signed Expenses may be negative. The donut omits nonpositive category nets and
divides by their positive sum. When that differs from Expenses, its center says
Chart total and text explains both totals and excess refunds. Refund-only months
show an explanation without a donut. See the [refund policy](../../../docs/transaction-improvements.md).

`SpendingDonutChart` receives `summary.categorySpending` and `summary.expenses`
from the dashboard hook. It has no financial queries, transaction
aggregation, separate month state, persisted state or chart dependency.
`spendingDonut.ts` groups existing category totals for presentation and formats
shares with the original en-CA, at-most-one-decimal formatter. Integer cents remain
authoritative. Geometry uses bounded floating-point percentages only; its last
segment closes the circle without modifying any money or displayed percentage.

The normal rule shows five largest named categories (descending cents, then ID
for ties) and combines every remaining category into Other. When all Unknown
category entries would fall outside those five, the first unresolved category
reserves the fifth named slot so historical missing-category data remains
identifiable. The displaced category joins Other. Additional unresolved categories
may be included in Other, with the existing warning still considering the entire
source list. There are at most five named slices plus Other, and every cent is
retained. Other appears last as a group, even if its combined amount is larger
than an individual category. Structural keys distinguish the Other group from a
real category named Other.

No-expense months retain the existing empty message and render no donut. One
category produces a full ring, its exact amount and 100%. The total at the center
is the net monthly Expense total when all category nets are nonnegative, using the centralized workspace-currency
formatter without abbreviations. Long totals use smaller relative typography and
wrap completely within the center; no amount is clipped or truncated. CAD, USD
and EUR, including the maximum safe integer cents, are checked.

SVG circles use `pathLength=100`, proportional dash lengths, cumulative offsets
and a top origin. The track is a themed border role. The SVG and legend markers
are decorative (`aria-hidden`, SVG `focusable=false`); a semantic HTML definition
list exposes Expenses and the total, and one labelled HTML list exposes each
category name, exact amount and percentage. Assistive technology never needs to
interpret the geometry or colors. There are no chart controls, hover-only data,
animations, tooltips, filters or drilldown.

The new legend replaces the prior progress bars and Show all/Show less behavior
so Home has one compact distribution view. Individual categories inside Other
are not listed on Home. Transaction history retains their detailed records and
existing filtering. Category names and numeric values wrap gracefully.

`--color-chart-category-1` through `--color-chart-category-6` define categorical
colors in every theme. Sage/Ocean use restrained teal, blue, gold, plum, clay and
slate tones; Dark uses lighter companion colors. These colors imply no financial
status. The SVG slices and corresponding markers use identical tokens; primary
and secondary text roles retain the existing theme semantics.

The chart is capped at 240px, with mobile legend below the centered ring. A native
CSS container query places donut and legend side by side when the Spending by
category section has at least 30rem of width. The desktop Home detail columns give
spending more width than Recent Activity. Container sizing responds to 200% text,
stacking the legend when needed rather than squeezing it. Upcoming payments and
the existing Home summary remain unchanged.

Month changes and financial/category data changes use the existing hook and shared
refresh behavior. Add/edit/delete Expense and category rename update the chart
without reload. Expense tax is informational: the total paid remains the category
contribution, and no tax slice exists. Income, Transfer, bills/installments and
recorded tracking payments do not enter the chart unless independently recorded
as normal Expense transactions. Financial calculations, models, persistence,
backup/CSV, workspace currency interpretation and PWA source are unchanged.

## Files and validation

Created:

- `src/features/dashboard/SpendingDonutChart.tsx`
- `src/features/dashboard/spendingDonut.ts`
- `tests/spending-donut.test.mjs`
- `tests/spending-donut.browser.mjs`

Modified:

- `README.md`
- `src/features/dashboard/README.md`
- `src/features/dashboard/DashboardSection.tsx`
- `src/features/dashboard/dashboard.css`
- `src/styles/tokens.css`
- `package.json` (browser-test command only)

Validation passed with Node 24.14.0 and Chrome:

| Command | Result |
| --- | --- |
| `npm test` | 371 passed (13 focused donut tests) |
| `npm run test:obligations:browser` | 99 passed |
| `npm run test:obligations:ui` | 263 passed |
| `npm run test:backup:browser` | 184 passed |
| `npm run test:settings:browser` | 92 passed |
| `npm run test:workspace-backup:browser` | 48 passed |
| `npm run test:expense-details:browser` | 96 passed |
| `npm run test:spending-donut:browser` | 107 passed |
| `npm run test:pwa:browser` | 216 passed |
| `npm run build` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |

All 1,476 unit tests and browser checks passed. Donut checks cover empty, one,
three and many categories; exact totals, order, grouping, rounded percentages,
unknown categories, tax inclusion, excluded financial/tracking types, month
selection, actual Expense editor add/edit/delete and category rename refresh,
accessible HTML text via the browser accessibility tree, CAD/USD/EUR, and all
three themes at 320px, 390px, tablet 768px and desktop 1280px with 100%/200% text.
Long names and maximum exact amounts fit without horizontal overflow. Screenshots
were visually reviewed. Existing production checks verify both hosting paths,
service-worker caching, offline operation, data exchange and safe application
updates. Review fixtures use isolated disposable browser profiles.

Review choices are the five-slice grouping policy with a reserved Unknown category
slot, grouped Other always last, and rank-based presentation colors. Category
colors may change when rankings/months change; names and exact numeric text are
always authoritative. Work remains uncommitted on
`feature/v1.1-onboarding-currency`.
