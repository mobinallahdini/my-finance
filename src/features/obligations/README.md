# Bills & Installments UI

Routes: `#more/bills-installments` and `#more/bills-installments/<encoded ID>`.
Both keep More active and survive reload. Month and filters remain while moving
between this list and its details; reloading defaults to the current local month
unless the route has a valid `?month=YYYY-MM` context supplied by Home.
All records remain accessible, including inactive, completed, and future records.
Filters only affect rows; summaries always cover all obligations.

All monetary state, due dates, statuses, progress inputs, and summaries come from
the existing pure obligation calculations. Due this month displays
`expectedTotalDueCents` with `remainingTotalDueCents` below it. Paid this month
displays **`paidDuringMonthCents` (actual paidDate month)**. Details display
`paidAmountCents` assigned to the selected **dueMonth**. Late payments therefore
can affect a different month's Paid summary from the obligation's monthly status.
Overdue counts `overdueObligations` for the selected month, not cumulative arrears.
All recorded payments count toward principal, including future paid dates, per
the foundation's current snapshot semantics. Completed installments have no
due label, even in the month of the final payment.

Editors use the existing exact cents parser and authoritative repositories.
Changing a bill payment's due month updates its default remaining amount.
Installment payment defaults use the smaller of schedule and global remaining
principal. Amounts remain editable, including deliberate overpayment. A zero
remaining balance leaves the initial amount blank. Multiple payments append IDs;
history sorts by paidDate descending. Same-date records use reverse stable read
order, because the model has no recording timestamp.

History prevents obligation deletion and unsafe type/start-month edits. Details
offer Set inactive / Set active; deletion is offered only without history.
Payment deletion requires confirmation and recalculates the current view. Native
modal dialogs contain focus, support Escape/discard confirmation, guard browser
navigation with unsaved changes, and restore focus to their opening control.

Writes only use obligations and obligationPayments repositories and the shared
refresh event. No financial transactions, account changes, schema
changes, or financial integration. Full Backup schemaVersion 2 includes both
tracking tables, so the temporary backup warning has been removed. Version 1
replacement restore clears tracking data with an explicit preview warning.

Validation: `npm run test:obligations:ui` runs real UI checks in a disposable Chrome
profile against Vite (default `http://127.0.0.1:5173`; override `BILLS_APP_URL`).
Requires Node 24 and Chrome; override `CHROME_BIN` if needed. The runner fixes
today to October 5, 2026 in America/Toronto, seeds only its isolated database,
handles native confirmations, and leaves review screenshots in a temporary
`my-finance-bills-review-*` directory. The existing foundation browser test
continues to check upgrade, persistence, integrity, and financial isolation.

Home's compact Upcoming payments preview receives Home's selected month directly
and reads tracking data independently with the same refresh hook. It uses domain
monthly targets, remaining amounts, due dates and statuses. Priority is overdue
(including overdue partial payments), partially paid, due today, due soon,
upcoming, then paid; ties use due date, name and ID. It shows at most three active
records with a target in that month. Completed installments are a fallback only
when no other relevant item exists; inactive and pre-start records never appear.
Partial row amounts use `remainingDueCents`; other rows use the month's
`expectedAmountCents`. Principal remaining is displayed separately. The caption
uses `remainingTotalDueCents`; none of these values feed financial dashboard
calculations. View all and Details links carry the selected month in the hash
query. Backup warnings belong in the restore preview, rather than Home.
