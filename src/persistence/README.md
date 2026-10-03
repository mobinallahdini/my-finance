# Persistence v1

Use `accountsRepository`, `categoriesRepository`, and `transactionsRepository`
from `./repositories`. The database and validators are internal implementation
details; React consumers should not import Dexie or access tables directly.
Records use the existing domain types without separate storage models.

The browser-local IndexedDB database is `my-finance`, with explicit Dexie version 1:

```ts
accounts: 'id'
categories: 'id, type'
transactions: 'id, date, type, accountId, fromAccountId, toAccountId, categoryId'
```

`id` is the primary key on every table, supplied by the caller. All other indexes
are non-unique. Date supports monthly date ranges, type supports transaction and
category filtering, the three account reference indexes support account history
and deletion checks, and categoryId supports category integrity checks. Missing
union fields have no index entry. No names, notes, balances, or amounts are indexed.
For migrations, retain version 1 and append `version(2).stores(...)` with an
`upgrade(...)` callback when existing records need transformation. Do not rewrite
version 1 to migrate installed databases. Construction does not seed records;
Dexie opens the database lazily on first operation.

Each repository provides `add(record)`, `get(id)`, `getAll()`, `update(record)`,
and `delete(id)`. Add returns the caller-supplied ID and rejects duplicate keys.
Get returns undefined for missing IDs; update rejects missing IDs; delete is
idempotent for missing IDs. Update replaces the complete record at its existing
ID, including optional fields, rather than applying a partial patch. IDs are
stable; an ID change is not an update. Writes snapshot the input before awaiting.
Errors reject the returned promise and should be handled by future callers.

Categories also expose `getByType(type)`. Transactions expose `getByType(type)`,
`getByAccount(accountId)` (expenses, income, and both transfer directions), and
`getForMonth(month)`. Month must be YYYY-MM with year 0001–9999. The date index
selects the inclusive range YYYY-MM-01 through YYYY-MM-31 in ascending date order;
invalid days cannot be persisted, so this also covers shorter months and December
9999. No Date objects, timestamps, or timezone conversion are involved. Other
queries have no promised presentation order.

Boundary checks enforce non-empty IDs, safe integer cents, positive amounts,
non-negative optional credit-card limits, valid calendar dates, valid type tags,
and the transaction union's reference-field restrictions. Opening balances may
be negative, preserving domain semantics. Zero credit limits remain valid.
Transaction writes require existing account(s), different transfer endpoints,
and an existing matching expense/income category. Reference checks and writes
share IndexedDB read-write transactions to prevent races with deletion or type
changes, including across tabs. Referenced accounts/categories cannot be deleted
or have their type changed. Names, opening balances, and credit limits remain
editable. No financial history is cascade-deleted; transaction deletion is explicit.

Income may target only an existing bank or cash account. Both
`transactionsRepository.add` and `transactionsRepository.update` enforce this
in the shared reference validation inside their IndexedDB read-write transaction,
using the same account lookup that checks existence. A credit-card destination
rejects with `RangeError`: "Income must target a bank or cash account. Credit-card
payments must be recorded as transfers." Expense account eligibility and transfer
endpoints are unchanged; credit-card payments use transfers.

`accountsRepository.update` already rejects any type change while the account is
referenced by a transaction, including income through `accountId`. This protects
bank/cash accounts with income references from changing to credit_card. Its
reference check and update share a read-write transaction on accounts and
transactions, overlapping the transaction-write scope. Concurrent writes,
including other database connections/tabs, cannot bypass the income destination
rule by changing account type between its validation and write.

No schema migration or automatic history rewriting is involved. Existing invalid
income records introduced before this rule must be corrected to a bank/cash
destination or explicitly deleted; updating them to a credit card is rejected.

Assumptions: a single currency, browser IndexedDB availability, caller-generated
IDs, and all application writes going through these repositories. Raw IndexedDB
access bypasses these application-level integrity rules. No balance snapshots,
credit-limit spending enforcement, seeds, UI integration, or synchronization are
implemented. Browser eviction/user-cleared storage can remove local data; backup
and export are future work.
