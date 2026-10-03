# Expense transactions

`TransactionsSection` owns expense entry, editing, confirmed deletion, history,
and a current local calendar month spending preview. Income and transfer entry
remain out of scope. History includes all expense dates, sorted descending with
ascending transaction ID as a deterministic tie-breaker within a date.

The form reuses the account feature's exact dollar parser and CAD formatter.
Amounts are positive safe integer cents. Date defaults use local calendar fields;
the date input checks its calendar/range constraints and the repository enforces
the domain's YYYY-MM-DD calendar rules. Blank notes are omitted and other notes
are trimmed. Updates replace the expense record at its original ID.

All reads and writes use the existing repositories. Account/category options are
read from persisted data, restricted to expense categories; repository writes
atomically recheck persisted references and matching category types. History
resolves current names by referenced IDs instead of storing name snapshots.
Missing references are displayed explicitly rather than hiding history.

## Refresh and balances

`features/shared/dataRefresh.ts` provides one in-memory event and a subscription
hook. Accounts, categories, and expenses notify only after successful repository
writes. All mounted subscribers reload their own repository data, including the
writing feature. Stable callbacks and effect cleanup prevent duplicate listeners;
load effect cleanup ignores superseded reads. Manual Refresh remains available,
including during expense editing so stale choices can be recovered without
discarding entered values. A failed refresh reports a read error without treating
a committed write as a failed save.

This deliberately small mechanism needs no global state library or persistence
changes. It covers writes made through these features in this app instance; it
does not synchronize changes from other tabs automatically. Reload/Refresh reads
persisted data again.

Accounts continue to read the full transaction ledger and call the existing
`calculateAccountBalance` and `calculateAvailableCredit` functions. Expense writes
never modify opening balances or store calculated balances. The monthly preview
calls `calculateMonthlyTotalExpenses` for the current local YYYY-MM; unsafe total
arithmetic produces a visible error, as in the existing account balance display.
