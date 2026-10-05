# Bills & Installments — domain and persistence V1

This step provides monthly obligation models, pure calculations, validation,
and IndexedDB repositories only. There is no feature UI, navigation, Home
card, notification, reminder, interest, fee, APR, or automatic recurrence engine.
Cadence is monthly only. All amounts are safe integer cents in the application's
shared currency; dates/months are Gregorian YYYY-MM-DD / YYYY-MM strings,
years 0001–9999, supplied as local calendar values.

## Models and monthly payments

`../models.ts` exports the readonly `Obligation = Bill | Installment` union.
Both have `id`, trimmed non-empty `name`, integer `dueDay` 1–31, `startMonth`,
optional string `note`, and boolean `isActive`.

- **Bill:** `type: 'bill'` and required positive `expectedAmountCents`. V1
  deliberately uses fixed expected amounts so paid/partial/remaining status is
  determinable. Variable bills without an expectation are not supported.
- **Installment:** `type: 'installment'`, positive `originalAmountCents` and
  `scheduledPaymentCents`. A schedule may exceed principal; calculations cap
  the final target to remaining principal. Remaining balance and completion
  are never stored as mutable fields.
- **ObligationPayment:** `id`, `obligationId`, `dueMonth`, `paidDate`, positive
  `amountCents`, optional string `note`. Several records may cover the same
  obligation/due month, allowing partial payments for both variants.

`dueMonth` is the month the payment satisfies. `paidDate` is when the payment
was made. An October bill paid November 2 has `dueMonth: '2026-10'` and
`paidDate: '2026-11-02'`; this is valid. Early payments are also valid. A due
month before the obligation's start month is invalid. An inactive obligation
can still receive explicit historical payments/corrections.

These records are independent tracking data. There is **no Transaction ID,
account ID, category ID, automatic Expense, account-balance change, or
Dashboard Income/Expense contribution**. Recording a payment here is not
posting it to the financial ledger.

## Pure calculations

`../obligationCalculations.ts` accepts immutable records and an explicit
`today: CalendarDate` where timing is needed. It never reads the system clock,
React, IndexedDB, or a network. `../calendar.ts` performs integer Gregorian
calendar arithmetic without Date objects, timestamps, UTC conversion, or DST
shifts. Leap years include the Gregorian century rules.

`resolveObligationDueDate(month, dueDay)` uses the requested day or clamps it
to the month's last day: day 31 gives 2026-01-31, 2026-02-28, 2028-02-29,
and 2026-04-30. An obligation does not become due before `startMonth`.

`calculateInstallmentBalance(installment, payments)` returns:

```text
totalPaidCents       = sum(all matching payment amounts)
remainingAmountCents = max(originalAmountCents - totalPaidCents, 0)
overpaymentCents     = max(totalPaidCents - originalAmountCents, 0)
isCompleted         = totalPaidCents >= originalAmountCents
```

Overpayment never produces a negative remaining balance and never rewrites a
payment. Calculations include **all supplied matching recorded payments**,
without a paidDate/today cutoff, just as existing ledger balances use their
supplied records. `today` controls timing, not whether a payment exists. These
functions describe the current stored snapshot, not an historical “as of” view.

`calculateObligationMonth(obligation, payments, month, today)` returns the
due date, applicability (`isDue`), expected/paid/remaining amounts, status,
timing status, overdue flag, and installment balance when applicable.

A Bill's month target is its expected amount. For an Installment, let `P` be
all matching payments and `M` the sum assigned to the selected due month:

```text
monthTarget = min(scheduledPaymentCents, max(originalAmountCents - (P - M), 0))
monthPaid   = M
monthLeft   = max(monthTarget - M, 0)
```

This reserves payments assigned to other months before determining the selected
month's target, so the target never exceeds remaining principal before that
month's payments. Prepayments in other months can therefore reduce this target.
Inactive or before-start months have no applicable due date, expectation, or
remaining amount; recorded payment totals remain retrievable. A completed
installment's completion-month target and actual payments can still appear in
that month's summary. Other months with no principal left have no target.

Status precedence is explicit:

| Condition | Status |
| --- | --- |
| `isActive === false` | `inactive` |
| Installment total paid >= original principal | `completed` |
| Selected month before start month / no applicable target | `upcoming` (not due) |
| Selected month's payments cover target | `paid` |
| Some payment, target still outstanding | `partially_paid` |
| No payment, due date before today | `overdue` |
| No payment, due date equals today | `due_today` |
| No payment, due date 1–5 calendar days away | `due_soon` |
| Other applicable unpaid date | `upcoming` |

`timingStatus` separately reports the date's calendar phase. Partial payments
can have status `partially_paid` and `isOverdue: true`. Paid Bills can retain
an elapsed timing phase but are never overdue: `isOverdue` requires a positive
remaining amount. Completed installments have no overdue timing. Inactivity
overrides completion status but preserves its derived financial balance.

`calculateObligationStatus` is the status-only helper, using today's month
unless an explicit selected month is supplied.

`calculateNextObligationDueDate` returns undefined for inactive/completed
records. Otherwise it starts at the later of today's month and `startMonth`.
It returns that month's due date if any amount remains, **even if that date is
overdue**. Covered months are skipped until the next uncovered month, including
prepaid future months. It does not search prior-month arrears; use selected
month summaries for those. No date is returned beyond December 9999.

`calculateObligationMonthSummary` returns all states, obligations due that
month, expected total due, remaining total due, and overdue obligations.
`totalPaidCents` sums payments **assigned to that dueMonth**, including inactive
and completed records. `paidDuringMonthCents` instead sums payments whose
**paidDate falls in that calendar month**, regardless of dueMonth. These two
totals intentionally differ for early/late payments and never feed Expense or
Income totals.

Relevant records are validated; summary inputs must contain all referenced
obligations. Duplicate IDs reject instead of double-counting. Individual and
aggregate amounts must be safe integers; aggregate overflow throws RangeError
instead of rounding or hiding it behind a clamp. Per-obligation helpers ignore
payments for other IDs. Inputs are never mutated.

## Persistence, integrity, and upgrade

`../../persistence/repositories.ts` exports `obligationsRepository` and
`obligationPaymentsRepository`. The existing `my-finance` Dexie database retains
version 1 exactly and appends version 2 with:

```ts
obligations: 'id, type, startMonth'
obligationPayments: 'id, obligationId, dueMonth, [obligationId+dueMonth]'
```

The three financial stores/index definitions are retained without data
transformation, replacement, seeding, or deletion. A fresh installation also
creates all five stores. The change follows Dexie's
[additive versioned schema API](https://dexie.org/docs/Version/Version.stores()).
`isActive` is not indexed: IndexedDB does not index booleans.

Both repositories expose add/get/getAll/update/delete. Obligations additionally
offer `getByType`; payments offer `getByObligation` and
`getForMonth(month, optionalObligationId)`, querying dueMonth rather than
paidDate. Updates replace the complete record at its stable ID, remove omitted
optional fields, and reject missing IDs. Adds reject duplicate IDs; get of a
missing ID returns undefined; delete of an absent ID is idempotent. Writes clone
caller input before awaiting storage. Queries have no promised UI sort order.

Shape/money/calendar checks live in `../obligationValidation.ts`, re-exported
by the existing persistence validation module. Unsupported fields, cross-type
fields, mutable balance/completion fields, and transaction links reject.
Payments require an existing obligation and cannot precede its start month.
Checks and writes share a read-write transaction covering both new stores.

An obligation with payment history **cannot be hard-deleted** or change type;
set `isActive: false` to archive/pause it. Moving startMonth after an existing
payment's dueMonth also rejects. Financial expectations, principal, schedule,
due day, name, and note remain explicitly editable. Changes apply to current
snapshot calculations, including selected past months; V1 does not version
these expectations. Lowering principal below payments exposes overpayment.
Historical payments are never changed by an obligation edit or deactivation.

Payments may be explicitly corrected, reassigned to another valid obligation,
or deleted. After all payments are explicitly removed, the parent may be
hard-deleted. Overlapping transaction scopes serialize reference checks against
deletion/start/type changes across independent browser connections/tabs. Raw
IndexedDB access can bypass these repository-level policies.

## Backup coverage and validation

**Full Backup schemaVersion 2 includes obligations and obligationPayments.**
The full financial and tracking reference graphs are validated before all five
stores are replaced in one atomic transaction. Version 1 backups remain supported,
but replacement clears both tracking tables; preview and confirmation explicitly
warn about this consequence. Custom Bills & Installments export always includes
obligations and recorded payments together. CSV formats remain financial-only.
See [Data & Backup](../../../docs/data-backup.md) for the canonical format.

Run `npm test`, `npm run build`, `npm run lint`, and `git diff --check`.
`tests/obligations.test.mjs` uses Node's built-in test runner (Node 24 supports
the TypeScript stripping used here). It covers fixed/partial Bills,
Installments, completion/overpayment, calendars/leap years/timezones,
status/next-date rules, summary allocations, overflow, validation, and financial
calculation regression boundaries.

For real IndexedDB checks, start Vite at `http://127.0.0.1:5173` and run
`npm run test:obligations:browser`. Override `BILLS_APP_URL` or `CHROME_BIN` if
needed. The dependency-free Node runner starts a headless Chrome/Chromium with
an automatically generated temporary profile; it never opens the user's
normal browser database. It seeds a genuine version-1 database, opens the real
version-2 application database/repositories, checks CRUD, integrity, independent
connection races, version 2 backup inclusion, fresh installation, and reopen durability,
then closes the browser and removes its verified temporary profile.
