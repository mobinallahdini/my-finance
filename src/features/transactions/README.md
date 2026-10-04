# Expense, income, and transfer transactions

`TransactionsSection` makes history the main experience. Compact, selectable rows
show a category or Transfer, an exact signed CAD amount, and account information.
Expenses display a minus sign, income a plus sign, and transfers a neutral amount
with From-to direction. Stored amounts remain positive cents. Notes are available
inside the editor. Existing sorting remains descending date then ascending ID.

`TransactionList` groups that order by the stored local calendar date, with Today,
Yesterday, or a readable full-date heading. `transactionPresentation` formats
calendar fields locally without converting YYYY-MM-DD through UTC or inventing
creation timestamps.

`TransactionFilters` provides a current-local-month default, previous/next month,
an accessible native month input, All dates, and independent All/Expense/Income/
Transfer radio filters. These affect history only and survive editor saves,
deletes, and refreshes. Filters are local component state; leaving Transactions or
reloading resets them. Filtered empty results and an empty ledger have separate
compact messages; an empty ledger offers Add Transaction.

The Add Transaction action or a selected row opens `TransactionForm` on demand.
The editor is a native modal dialog: full-screen below 48rem and centered at wider
viewports, with a maximum 36rem width. Its fixed header contains Cancel/title/Save;
the body scrolls independently while background scrolling is locked. New entries
use the shared accessible `TransactionTypeControl` radio segments. Amount appears
first, followed by relevant fields, date, and optional note. Switching a new type
retains amount/date/note and clears account/category references. Existing entries
retain their type and ID; Delete appears only inside their editor and requires
confirmation.

Amount receives initial focus after loading. Tab stays inside the modal, Escape
uses the same close path as Cancel, and dirty drafts require discard confirmation.
Setup links and same-document Back/Forward/hash departures also check for dirty
changes; reload/closing the tab uses the browser's beforeunload warning. Declined
same-document navigation restores the editor URL with replaceState before the app
reads the destination, so that traversed history entry is replaced. Drafts are not
persisted. On close/save, focus returns to the originating control, with Add as a
fallback if the row was deleted or moved outside the filters. Loading and writes
disable editor actions, and field errors retain their associated descriptions.

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
Prerequisite messages explain missing eligible accounts or matching categories,
link directly to Accounts/Categories, and prevent saving until setup is complete.

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

## Refresh and balances

The existing `features/shared/dataRefresh.ts` event remains unchanged. Successful
expense/income/transfer writes notify all mounted features to reload their repositories,
including Accounts, Categories, and Transactions. Account/category changes also
refresh history names and form choices. Stable subscriptions and load effect
cleanup ignore superseded reads. Refresh / Retry appears only for an actual read
failure, in history or the editor, and retains any mounted draft. Failed reads
report errors without turning a committed save into a failed write.

Refresh covers this app instance; other tabs require Refresh/reload. Browser
reload reads the persisted ledger again. Opening balances are never mutated and
calculated balances are never stored. Accounts continue using the full ledger
with `calculateAccountBalance` and `calculateAvailableCredit`.

Monthly summaries remain on Home; history filters do not change calculations.
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
