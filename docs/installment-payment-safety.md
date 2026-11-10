# Installment payment safety — milestone 5A

Status: executable historical baseline plus a **proposal for milestone 5B**.
No schema v4, backup v4, links, account integration, UI, financial calculation,
or service-worker changes are implemented by 5A. The proposal below is normative
for subsequent implementation review; it is not a claim that these APIs exist.

## Current behavior, verified from source

- `src/domain/models.ts`: `ObligationPayment` contains only `id`, `obligationId`,
  `dueMonth`, `paidDate`, positive `amountCents`, and optional `note`. Bills and
  Installments share this tracking model. No account/category/transaction link.
- `src/domain/obligationValidation.ts`: rejects unknown/cross-type fields,
  invalid dates, nonpositive/unsafe amounts, missing obligation references,
  and due months before start. Overpayment, early/late paid dates, and corrections
  on inactive obligations are valid. Duplicate IDs reject in calculations/storage.
  These rules must not be relaxed.
- `src/persistence/database.ts`: Dexie v1 has Accounts/Categories/Transactions;
  v2 adds Obligations/ObligationPayments; v3 adds ApplicationSettings. V3 fills
  completed CA/CAD/personal/January settings only for populated legacy data without
  settings. None of these migrations creates a financial transaction. Dexie uses
  native IndexedDB versions 10, 20, and 30 respectively.
- `src/persistence/obligationRepositories.ts`: add/update validate under a write
  transaction containing Obligations and Payments. Add rejects duplicate IDs;
  update is full-record replacement and rejects a missing ID. Delete removes a
  payment only. All three operations leave financial stores untouched. Obligation
  deletion/type changes are protected by payment history.
- `src/features/obligations/ObligationPaymentForm.tsx`: currently makes a new UUID
  during submit and saves tracking data only. Busy guards in the screen/dialog
  protect ordinary UI submissions; there is no durable operation receipt.
- `src/domain/calculations.ts`: bank/cash use signed asset balances; cards use
  signed debt balances. Expense increases card debt; Refund reduces it, possibly
  below zero into account credit. Income must target Bank/Cash. A Bank/Cash → Card
  Transfer reduces the source asset balance and card debt. Tax is already included
  in Expense amount; available credit is limit minus signed debt, without clamping.
- `src/domain/obligationCalculations.ts`: principal is independent of the ledger.
  All recorded payments count, even paid after `today`; today controls timing only.
  Assigned due month and actual paid-date month are different totals. Remaining
  principal is clamped at zero; excess is separately reported as overpayment.
- `src/features/dataBackup/backupFormat.ts`: Full Backup v1 has financial stores
  and theme; v2 adds tracking, with optional stored settings compatibility; v3
  requires all six business stores/settings and theme. V1 replacement intentionally
  has no tracking history. V1/v2 missing settings are reconstructed according to
  existing documented rules. **Backup replacement is not an application upgrade.**
- `src/persistence/dataBackup.ts`: workspace replacement validates first and
  replaces six stores in one Dexie read-write transaction. Theme is localStorage,
  outside IndexedDB's atomic boundary. UI applies theme after successful restore.
- `src/pwa/service-worker.js`: installed workers wait for existing app clients;
  no skipWaiting, forced reload, clients.claim, or financial-data cache entries.

## Executable historical baseline

`tests/fixtures/v12-installments.json` pins v1.2.0 to commit
`67c5d5c2f0e47d0136d400215883bf34611021e8`. It contains only synthetic data:
six accounts, three categories, thirteen transactions, seven obligations,
thirteen tracking payments, completed non-default DE/GBP/business/July settings,
and Ocean theme. It includes Bank/Cash, debt and credit cards, an overdraft, a
card without a limit, all four transaction types, tax/receipts, Unicode notes,
monthly bills, partial/completed/overpaid/future/inactive installments, multiple
payments per due month, and late paid dates.

Expected values are fixed integers in checked-in JSON, not generated from the
candidate's calculations. `tests/helpers/installmentBaseline.mjs` projects actual
production calculations; it does not implement a second financial calculator.
Both the released and candidate functions must independently equal these values.

All values below are integer cents in the fixture's GBP workspace:

| Account | Opening | Derived signed balance | Available credit |
| --- | ---: | ---: | ---: |
| Bank | 100000 | 366000 | N/A |
| Cash | 20000 | 21900 | N/A |
| Debt card | 50000 | 50000 debt | 50000 |
| Credit card | -5000 | -9500 (9500 account credit) | 59500 |
| Overdraft | -2500 | -2500 | N/A |
| Card without limit | 1234 | 1234 debt | absent |

| Installment | Original principal | Total paid | Remaining | Overpayment |
| --- | ---: | ---: | ---: | ---: |
| Partial | 100000 | 30000 | 70000 | 0 |
| Completed | 50000 | 50000 | 0 | 0 |
| Overpaid | 10000 | 12000 | 0 | 2000 |
| Future | 30000 | 0 | 30000 | 0 |
| Inactive | 20000 | 6000 | 14000 | 0 |

At fixed today `2026-10-20`, October expected due is **58000**, payments assigned
to October **50000**, actual October paid dates **48000**, remaining due **13000**,
with one overdue bill. September expected due is 56000, assigned paid 63000,
actual paid 58000, remaining zero. November expected/remaining due is 28000,
assigned paid zero, actual paid 7000. October partial-installment target stays
20000 with 10000 paid and 10000 still due. Completed installments may still have
a capped expected amount in a past/current assigned month; preserve that current
snapshot behavior. Do not replace it with a historical-as-of calculation.

The financial ledger contains exactly five Expenses, two Income records, three
Transfers, and three Refunds. Global gross Expenses 41600, Refunds 13000, net
Expenses 28600, Income 301000, cash flow 272400, and Transfer volume 27000 must
remain unaffected by every historical tracking payment.

The browser suite archives/builds the actual release, lets it create its real
database, then seeds its empty disposable database with validated synthetic
records. No developer browser profile is inspected. It performs a real production
worker update without any backup/restore step, keeps a second old app tab open to
verify waiting, compares raw records/schema/indexes/localStorage and exact UI
values, and reloads the candidate offline. It emits `baseline.json` containing
released/candidate native snapshots, expected projections, UI values, provenance,
and a SHA-256 of canonical business records. IDs and optional-field absence are
preserved, not just counts or rounded totals.

Separate disposable checks cover actual released v1/v2 schema declarations,
legacy settings bootstrap, tracking-only lifecycle, duplicate IDs, unsupported
future fields, and full-restore rollback after injected AbortError/QuotaExceededError.
They simulate failure at the end of writes; they do not fill the real disk or
claim to reproduce a physical power loss. Backup v1/v2 fixtures are documented
compatibility projections: Refund is omitted from both; v1 also omits tax/receipts
and tracking. They are not claimed to be files exported by an older binary with
knowledge of newer fields.

## Non-negotiable upgrade rules for 5B

1. Do not rewrite historical accounts, categories, transactions, obligations,
   payments, settings, or theme during a v3 → v4 upgrade.
2. No backfill of Expense/Transfer records, transaction links, payment modes,
   timestamps, balance corrections, or duplicate-removal guesses.
3. **Missing link means tracking only. It is never a pending financial command.**
   No startup, report, migration, restore, or background task may infer otherwise.
4. Additive stores/indexes may initialize new control metadata only. Recalculate
   balances using existing domain functions; never store/correct balance snapshots.
5. Unlinked historical payments retain the same principal/monthly calculations.
   New link metadata must not contribute another payment or financial amount.
6. This first integration should link newly recorded installment payments only.
   Bills remain tracking only; converting historical payments is separate scope.

## Explicit operations and valid combinations

Financial mode must be an explicit confirmed choice. Account suggestions and
matching candidates must never select/post a financial mode automatically.

| Mode | Valid transaction/account shape | Financial mutation |
| --- | --- | --- |
| Tracking only | Existing valid installment and positive payment; no financial fields | None |
| Create Expense | Expense category; one Bank/Cash/Card account; same amount and paid date as payment | Add exactly one Expense |
| Link existing Expense | Existing Expense, valid references/category, same amount and paid date, not already claimed by another payment | None; create the payment/link only |
| Card repayment, create or link | Bank/Cash source → distinct Credit Card destination; Transfer, no category/tax/receipt; same amount and paid date | Add one Transfer, or link the existing Transfer unchanged |

Card purchase and repayment are different events. Creating an Expense on a Card
records a purchase/increases debt; it does not deduct Bank/Cash. Paying previously
recorded card debt uses a Transfer and must not create another Expense. Expense
linking acknowledges an independently recorded purchase without posting it again.
Do not use Income or Refund as a repayment. Credit Card → Credit Card/Cash/Bank
Transfers remain valid in the general ledger but are outside this initial payment
flow; supporting cash advances/refinancing needs another explicit design.

The linked transaction's total amount is authoritative; tax is already included.
Due month may differ from paid date. Notes, receipt number and tax remain separate
transaction metadata and must not be fabricated from the payment. Retain existing
overpayment/account-credit behavior, without automatically capping paid amounts
to principal or available credit. Initial linking is one payment per complete
transaction, without split allocations. A partial amount/date mismatch is rejected
until the user explicitly corrects tracking or chooses another transaction.

## Proposed schema v4 (NOT IMPLEMENTED)

Retain declarations v1/v2/v3 and all existing keys/indexes. Append v4 with:

```text
obligationPayments:
  id, obligationId, dueMonth, [obligationId+dueMonth],
  &transactionId, &creationOperationId
paymentOperations:
  id, paymentId, transactionId, lifecycle
applicationControl:
  id
```

Indexes for absent optional values are sparse. Historical payments therefore
occupy no transaction/operation unique keys. Do not insert empty-string links.
Proposed additional payment fields:

```text
creationOperationId?: UUID             // required for new service operations
revision?: nonnegative safe integer    // absent historical value reads as 0
transactionId?: nonempty ID            // one-to-one unique while linked
financialMode?: 'expense' | 'card_transfer'
linkOwnership?: 'created_for_payment' | 'existing_transaction'
```

The last three fields are all present or all absent, validated against the actual
transaction graph inside the transaction. New tracking-only service operations
have an operation ID but no financial link. Historical records get no new fields.
Operation receipts, not names/notes or UUID prefixes, prove ownership. Do not add
stored derived balances or change the canonical transaction CSV schema.

No revision/origin field is required on historical financial transactions. Use
the payment revision plus a canonical snapshot of the linked transaction for
compare-and-swap: serialize the current transaction synchronously under the write
lock and compare it with the user's expected snapshot. This protects existing
Expense metadata without rewriting that record merely to attach a link. Account
and category eligibility is revalidated under the same lock.

`paymentOperations` contains a caller-generated stable operation ID, versioned
canonical request digest, operation kind, payment/transaction IDs, ownership,
committed result revision, and lifecycle (`applied` or `retired` with reason).
Creation/update/unlink/deletion commands each have their own operation receipt.
Creation receipts are retired when their payment is deleted/unlinked as appropriate.
Retired receipts remain indefinitely in v1.3 and are included in Full Backup v4.
Never reuse an ID or remove receipts merely because a payment no longer exists.
The unique payment transaction index prevents sharing one independently recorded
Expense/Transfer, even across tabs and concurrent submissions.

`applicationControl` has a local singleton with an opaque `workspaceEpoch` and
writer-protocol version. Initialize it in its new store only; do not extend/rewrite
the existing strict ApplicationSettings record. Rotate the epoch on full replacement
restore. Every new writer checks its expected epoch under its write lock. This
fences cooperative stale requests after restore, not already released old binaries.

## Atomic service and retry contract

All new mutation entry points must use one service, including direct financial
edits/deletes, obligation edits/deletes, imports, restores and account/category
reference changes. UI guards alone do not provide integrity.

1. Generate stable operation/payment/proposed transaction UUIDs once per confirmed
   intent, before the first attempt. Do not generate a new UUID for each submit
   handler or transport retry. Keep the same canonical payload on retries.
2. Parse/normalize input and compute the versioned digest before opening IndexedDB.
   Include mode, stable IDs, amount, dates, accounts/category and expected revisions;
   exclude transient UI/generation timestamps. No network/hash await inside the
   live write transaction.
3. Open one Dexie `rw` transaction containing ApplicationControl, Operations,
   Obligations, Payments, Accounts, Categories and Transactions. Recheck epoch,
   then operation ID/digest. Same ID plus different digest rejects as conflict.
4. If a receipt already exists, return its applied/retired outcome without writing
   again. Never recreate a missing payment or transaction from a receipt. Returning
   a historical result must not imply the payment still exists today.
5. For a new operation, validate references, matching amount/paid date, ownership,
   unique link, expected payment revision/transaction snapshot, and the unchanged shared financial
   validators under that same lock. `add`, not `put`, creates new identities.
6. Add/update the tracking payment, optional financial transaction, and operation
   receipt in this one transaction. A failure/abort rolls back all of them. Linking
   an existing transaction must issue no `put`/`add`/`delete` to that transaction.
7. Show success and broadcast ordinary refresh only after commit. Do not catch a
   failed write inside the transaction and accidentally allow a partial commit.

Overlapping IndexedDB write scopes and unique indexes serialize concurrent tabs;
per-tab busy flags reduce duplicate clicks but do not replace that protection.
Concurrent edits must compare revisions/existing values to reject stale writes.
Account/category mutation and full restore must overlap the relevant reference
locks. After interruption, discover committed receipts before offering a retry.
An uncommitted aborted operation has no receipt and can be retried with its same
intent IDs after explicit user action. Reload recovery must show recent results,
not silently resubmit. Different new UUIDs describe different intents; identical
amounts/dates may be legitimate partial payments and are not a deduplication key.

After deletion, a late retry with the creation ID returns a retired outcome and
does not post money again. After full restore, an old epoch rejects even if its
receipt was absent from the restored backup. A Full Backup v4 carries portable
receipt IDs/digests/tombstones; its destination uses a newly generated local epoch.

## Ownership and lifecycle

| Operation | Created-for-payment transaction | Independently recorded transaction |
| --- | --- | --- |
| Change payment note/due month | Payment-only correction; preserve financial metadata | Same |
| Change amount/paid date/accounts | Explicit review and atomic paired edit using shared validators and revision checks | Reject mismatch; explicitly unlink first, leaving the transaction unchanged |
| Delete payment | Default preserves/detaches financial record. Explicit separate option may atomically delete both only after ownership/revision checks | Delete tracking/link only; preserve transaction exactly |
| Direct transaction edit/delete | Block protected changes and route through linked-payment management | Require explicit unlink before change/delete; preserve payment as tracking-only |
| Unlink | Explicit atomic detach plus retired creation/link receipt; no financial mutation | Same |

Do not infer permission to delete from having a link. A created transaction's
origin remains in its receipt even after detach; detached money is never silently
removed later. Removing the tracking payment can increase remaining principal
while preserving the ledger; the confirmation must explain that result. Financial
amount/date/type/endpoint/category changes belong in the paired service; metadata
edits must also preserve links and ownership. A tax-bearing Expense whose new
total is below recorded tax rejects until the user explicitly corrects its metadata;
do not scale or drop tax automatically. Refunds remain independent financial
records and must not silently reverse installment principal or retire links.

Deleting an obligation with payments remains blocked. Inactive obligations retain
history; principal changes may expose existing overpayment, without rewriting it.
Revision and link checks must apply to repositories, not only screens.

## Proposed Full Backup v4 and restoration (NOT IMPLEMENTED)

Use `schemaVersion: 4` with all existing business sections, complete workspace
settings/theme, optional payment links/revisions, and required `paymentOperations`.
ApplicationControl's local epoch/protocol state is not portable backup data. A full
export reads every business section and receipt in one snapshot transaction.
Custom backups must include Payments + Obligations + Operations + Transactions +
their referenced Accounts/Categories whenever links are included; otherwise they
cannot claim to be restorable Full Backups.

Validate the complete graph before writes: known fields; supported modes; unique
IDs and claimed transaction links; existing obligation/transaction/account/category
references; amount/date agreement; correct Expense or Transfer shape; ownership
receipt consistency; safe revisions; live receipts pointing to live records;
retired receipts allowed to refer to deleted records but never authorize replay.
No orphan/mismatched live link may be repaired by synthesizing a financial record.
Reject a v4 payment-only link with no matching transaction/receipt.

Under one all-store `rw` transaction, recheck the local epoch/preconditions, clear
and replace the portable graph, and rotate the local epoch. Any quota failure,
validation error, abort or interruption leaves the old graph and epoch intact.
After ambiguous commit, inspect epoch/receipts; never rerun blind. Only the latest
client may restore. No partially applied/imported link graph is a valid success.

Legacy Full Backups remain accepted under their existing shapes:

- V1 restores its financial data and empty tracking, with the established settings
  reconstruction. This explicit replacement can remove current tracking; preview
  must explain it. It is never an automatic upgrade procedure.
- V2 restores represented tracking exactly, without links/operations or invented
  settings; use the existing optional-settings/fallback reconstruction contract.
- V3 restores all six stores exactly, with payments tracking-only. Legacy files
  must not carry future link/operation fields; do not silently accept unknown data.
- Rotate the destination epoch for every explicit full replacement, including
  v1/v2/v3. Do not keep unrelated prior link receipts as though they belong to the
  restored graph; stale requests are fenced by the old epoch instead.

Theme is localStorage and cannot join an IndexedDB transaction. Validate it before
writing, apply only after a successful business commit, and report/retry theme
storage failure separately without replaying the financial restore. A fully atomic
theme/business restore would require another future design; do not claim it now.

## CRITICAL: coexistence of older PWA clients

The executable generic probe demonstrates this installed Dexie behavior:
an old version-1 connection is closed for a version-2 upgrade, automatically
reopens the newer native database after its VersionError fallback, and successfully
`put`s its old shape, erasing an unknown field despite a new unique index on it.
The old connection also deletes the record, leaving its separate receipt orphaned.
A separate receipt store survives but cannot prevent deletion/mismatch. This probe
uses its own unrelated test database; no production schema v4 is created.

Therefore **versionchange, a schema number, a new optional field, a unique index,
BroadcastChannel, Web Locks, or a flag in ApplicationControl alone cannot fence
already released v1.2 code**. That code does not consult the new protocol. Its
full-record payment update and six-store replacement restore can discard future
link information or leave orphaned receipts; transaction update/delete can bypass
future pairing rules. New-code validation alone cannot make those old writes safe.

5B must fail closed for financial linking until mixed-version safety is proven:

1. Preserve the existing worker's wait-for-all-old-clients behavior. Do not force
   activation or reload an open editor. Verify all same-origin app contexts,
   including uncontrolled tabs/windows and restored sessions, have a compatible
   writer protocol before enabling linked mutations or restore.
2. A possible controlled-PWA rollout requires a compatibility bridge, an active
   compatible worker, version handshakes including uncontrolled clients, and a
   tested admission protocol covering new/returning old clients during the check
   and migration. Nonresponding/old clients block the operation and require the
   user to close/update tabs, without requiring a manual financial backup.
3. Do not treat an empty tab list or a one-time handshake as a hard guarantee.
   There is no demonstrated hard write fence for an unmodifiable old client in
   this schema proposal. Disabling Service Worker, BFCache/session restoration,
   a direct old entry point, or a new client racing admission must be included in
   validation. Unsupported environments keep links disabled, not partially active.
4. If a reliable controlled admission protocol cannot be demonstrated, choose a
   stronger storage/client-isolation design before release. Do not ship concurrent
   old writers and assume later reconciliation can reconstruct erased information.
   A separate database alone also creates divergent ledgers unless its ownership
   and admission rules are solved.

This is a **release blocker for 5B**, not a blocker for this test/documentation
milestone. The current real production test verifies the existing worker waits;
it does not claim to prove a future v4 write fence. The local epoch protects
cooperative new clients only. Service-worker/client-admission changes, if selected,
need separately reviewed 5B scope; 5A changes no worker behavior.

## Required 5B acceptance matrix

These are pending implementation tests, not passing tests of nonexistent APIs:

| Scenario | Required assertion |
| --- | --- |
| Fixture v3 → v4 and repeated/offline startup | Raw historical records, all baseline projections/settings/theme unchanged; no new Expense/Transfer/link |
| Tracking-only confirmed operation | One payment, no financial record; existing bill/principal formulas unchanged |
| New Bank/Cash Expense | One payment/Expense; exact single deduction; committed receipt |
| New Card Expense | One payment/purchase; card debt increases once; no Bank deduction |
| Existing Expense/Transfer link | One payment/link, zero writes to existing transaction |
| Card repayment | One source deduction and card-debt reduction; zero extra Expense; account credit allowed |
| Double click, retry, two tabs same ID | One committed result, one financial mutation at most |
| Same ID with changed payload | Conflict; no new records or writes |
| Two different operations claim one transaction | Exactly one succeeds; losing payment/receipt is rolled back |
| Amount/date/category/endpoint mismatch or Refund/Income link | Reject unchanged graph |
| Abort/quota at each write stage | No orphan payment, transaction, link or receipt |
| Interruption before/after commit | Receipt recovery distinguishes retry from success; no repost |
| Payment edit versus transaction edit/delete | One serialized consistent result or stale-revision conflict |
| Borrowed link deletion/unlink | Existing transaction unchanged; receipt retired |
| Created link paired deletion | Explicit choice, ownership/revision verified, atomic deletion |
| Deleted payment then delayed creation retry | Retired result; zero recreation/deduction |
| V4 backup restore then delayed pre-restore retry | Old epoch rejected; imported tombstones retained |
| Legacy v1/v2/v3 restore into v4 | Exact represented records, no links inferred; fresh local epoch |
| Invalid/partial/duplicate/orphan v4 graph | Reject before mutation; rollback on mid-write failure |
| Old PWA client reconnects/edits/restores during upgrade | Proven admission/fence, not merely newer schema or an orphan warning |
| Theme write failure after restore | Financial commit not replayed; separate preference recovery |
| Archived/completed/overpaid obligations; dueMonth vs paidDate | Existing exact baseline behavior remains correct |

## Running the baseline

Run `npm test`, `npm run test:installments:safety`, the existing obligations,
backup/settings and production upgrade browser suites, `npm run build`,
`npm run lint`, and `git diff --check`. Browser safety requires a current production
build, installed Node 24/Chrome/git/tar, and existing dependencies. No install is
performed. It creates only disposable profiles/source copies and synthetic data.

`INSTALLMENT_EXPECTED_DEXIE_VERSION` defaults to 3. Set it to 4 only alongside an
approved future migration; historical raw-record and calculation assertions must
remain unchanged. New schema-only control-store writes may be allowed explicitly,
never historical business writes. Current lifecycle probes describe today's
repository API; any 5B service adaptation requires new operation-level tests,
not weaker financial expectations. Keep the generic unsafe-client probe as a
reminder: passing the preservation baseline does not prove future link safety.

Open 5B decisions: a demonstrable mixed-version admission/storage fence (blocking),
confirmation of initial Card Transfer direction restrictions and one-transaction
allocation policy, ownership-aware direct-edit UI, operation payload/digest schema,
and localStorage-theme recovery UX. These proposals need review before enabling
financial links. No historical-data conversion or manual-backup prerequisite is
part of the proposed automatic upgrade.
