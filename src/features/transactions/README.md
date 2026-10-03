# Expense, income, and transfer transactions

`TransactionsSection` owns one Expense/Income/Transfer entry selector, shared form,
confirmed deletion, combined history, and current local month totals. The selector
controls the next entry and is disabled during editing; existing entries retain
their type and ID. History shows all types regardless of the selector, sorted by
descending date then ascending ID.

`TransactionForm`, `TransactionList`, and `useTransactions` extend the original
expense implementation. All types reuse the exact dollar parser and CAD
formatter. Amounts must be positive safe integer cents. Dates default using local
calendar fields and persist as YYYY-MM-DD. Blank notes are omitted and other
notes are trimmed. Updates replace records at their original IDs.

Categories are filtered to match the entry type. Expenses allow all account
types; income only allows bank and cash accounts. The form also validates the
selected account against the eligible list on submission. The feature save path
rereads the persisted income destination and rejects missing or credit-card
accounts before calling the transaction repository, for both creation and edits.
Empty states explain missing eligible accounts or matching categories.

Transfers show From and To account fields and no category. Both lists include
bank, cash, and credit-card accounts. The opposite selection is disabled, and
change handlers clear any conflicting selection. Submission independently checks
that both IDs exist in the loaded account list and differ. Persistence rechecks
their existence atomically. At least two accounts are required; categories are
not required. Transfer records contain only the transfer endpoints, amount,
calendar date, ID, and optional trimmed note, with no category/accountId fields.
Editing preserves the ID and type, and deletion confirms before removing only
the transaction. History resolves both current endpoint names by persisted IDs.

All reads and writes use existing repositories. History resolves current names
by referenced IDs. Missing references remain visible. Any existing income tied to
a credit card remains in history with a warning; editing requires changing its
destination to an eligible account.

## Persistence enforcement

The transaction repository enforces bank/cash income destinations on both add
and update. The account lookup, destination check, and write share an IndexedDB
read-write transaction. The existing account-update guard also rejects type
changes for accounts referenced by income, closing the concurrent type-change
gap. Direct repository callers are subject to the same invariant as this UI.
Credit-card payments belong to transfers. See `../../persistence/README.md` for
the persistence boundary and error contract. Existing invalid history is not
automatically rewritten; it can be corrected to an eligible destination or
explicitly deleted. Domain balance calculations retain their existing semantics.

## Refresh, balances, and monthly totals

The existing `features/shared/dataRefresh.ts` event remains unchanged. Successful
expense/income/transfer writes notify all mounted features to reload their repositories,
including Accounts, Categories, and Transactions. Account/category changes also
refresh history names and form choices. Stable subscriptions and load effect
cleanup ignore superseded reads. Manual Refresh is available during editing
without discarding entered values. Failed reads report errors without turning a
committed save into a failed write.

Refresh covers this app instance; other tabs require Refresh/reload. Browser
reload reads the persisted ledger again. Opening balances are never mutated and
calculated balances are never stored. Accounts continue using the full ledger
with `calculateAccountBalance` and `calculateAvailableCredit`.

The monthly preview calls `calculateMonthlyTotalExpenses` and the new pure domain
function `calculateMonthlyTotalIncome` for the current local YYYY-MM. Income does
not count as spending. Each total independently reports unsafe arithmetic. No net
cash flow or full dashboard is added.

Transfers are excluded from both monthly totals by the existing domain functions.
Balance calculations are unchanged: outgoing transfers decrease bank/cash funds
or increase credit-card debt; incoming transfers increase bank/cash funds or
decrease credit-card debt. Bank-to-card transfers therefore represent payments.
Card-to-bank and card-to-card transfers follow the same direction rules. Card
debt may become negative for an overpayment and is never clamped. No fees or
interest are introduced.

Existing persistence transfer validation already enforces positive safe integer
cents, valid dates, two distinct non-empty account IDs, and no categorized fields.
The reference check requires both persisted accounts inside the write transaction.
Account deletion and type-change guards cover both `fromAccountId` and
`toAccountId`. No domain or persistence changes are needed for transfer entry.
