# Financial Report exports (v1.3 milestone 4)

Reports offers **Export CSV**, **Summary CSV**, and **Print / Save as PDF**.
Every action captures the currently applied `PreparedReport`, selected columns
and workspace currency. Unapplied date/filter drafts are excluded. The selected
on-screen group and pagination do not narrow exports: every matching transaction
appears once, in engine order. Group summaries come directly from the engine.

## Detail CSV

`my-finance-report-rows-YYYY-MM-DD.csv` is a rectangular report table. Its selected
column headers and order match the screen, with the currency code appended to
monetary headers, followed by `currency_code`, `report_format`, and `text_encoding`.
`report_format` is `my-finance-report-v1`; `text_encoding` is the established
`my-finance-apostrophe-v1`. An empty report contains only its headers, which still
identify the currency through the mandatory Amount column.

All monetary cells use the existing exact integer-cent decimal formatter, without
currency symbols or thousands separators. Expense Amount is negative; Income and
Refund Amounts are positive; Transfer Amount is positive volume. This is the
screen's reporting sign convention, including for credit-card Expenses. It does
not represent bank-balance change. Recorded tax is already included in Amount.
Tax/VAT and Expense subtotal remain their recorded/normalized positive values;
a zero subtotal is `0.00`. Missing or inapplicable metadata is an empty cell.

Notes preserve original commas, quotes, Unicode, and line breaks. The existing
CSV writer quotes fields and doubles embedded quotes. Every non-empty text cell
uses the existing apostrophe prefix to protect spreadsheet formulas, including
account names, dates, notes, and receipt numbers. Consumers that need original
text remove exactly one leading encoding apostrophe. Validated numeric cells
remain numeric, including negative values. Transfer endpoints are actual internal
accounts; no external counterparties are inferred.

These files deliberately use a different schema from restorable Transactions
CSV. Existing transaction import/export and backup formats are unchanged.

## Summary CSV

`my-finance-report-summary-YYYY-MM-DD.csv` is a separate rectangular key/value
table with headers:

`scope,group_key,group,field,value,currency_code,text_encoding`

- `metadata` rows contain format, UTC generation time, inclusive date range,
  grouping, visible columns, financial conventions, and every applied filter.
  Their values use the text encoding above.
- `global` rows contain all seven report metrics, using decimal monetary values
  or an integer Matching transactions count.
- `group` rows contain the same engine metrics for each group. Account groups
  additionally include Transfer In and Transfer Out. Group keys distinguish equal
  labels. These counts and transfer volumes are not additive across accounts.

There are no preamble lines or embedded sections with a different column count.
Zero-match reports retain all seven global zero metrics and their metadata.

## Print and PDF

The Print action mounts a temporary print-only React portal and commits its DOM
before calling `window.print()`. The native browser dialog provides the printer
and Save as PDF choices. `afterprint` removes the portal and restores the action's
focus. Close print view provides recovery if a browser suppresses that event.
Errors remove the print DOM and leave a retryable alert. Navigation/unmount also
removes the portal. No HTML report files or temporary databases are created.

Print includes My Finance / Financial Report, generation time with timezone,
inclusive date range, explicit applied filter values, currency, all seven metrics,
all engine group summaries when active, and every matching row with the selected
columns. Account grouping explains non-additivity and separate transfer
directions. The detail table lists each transaction once. Empty reports retain
headers, summaries, and an explicit no-match message.

Print CSS hides the application root while the portal is present, excluding all
navigation, controls and dialogs. It uses black text on white, A4 landscape page
defaults, repeating table headings, normal-row break avoidance, and wrapping for
long text and exact amounts. Browser print settings can override page defaults.

## Performance, privacy and limitations

Exports reuse the frozen report; they never reload, filter, regroup, or calculate
totals. CSV formats each row once. The full print table is absent during normal
use, preserving 25-row screen pagination. Reports over 2,000 rows require explicit
confirmation before constructing print DOM; accepted reports include every row.
There is no silent truncation. Very large CSV files still require browser memory
for serialization and the Blob; very large print jobs require more memory for
layout. A narrower applied date range or CSV is available when native print
layout is impractical. No arbitrary hard export limit is imposed.

Downloads occur only after an explicit action through local Blob URLs, revoked
using the established download lifecycle. Reports issue no database writes,
uploads, remote API calls, report logging, service-worker changes, or generated
file cache entries. Summary/detail CSV generation and print use no dependencies.
The existing asset cache stores application code, not the generated files.

## Validation

Run `npm test`, `npm run test:reports:exports`, the existing browser suites,
`npm run build`, `npm run lint`, and `git diff --check`. Tests use disposable
browser profiles. Unit tests cover CSV precision, structure, signs, escaping,
injection protection, missing metadata, currencies, engine summary parity,
grouping, empty data, and a complete 10,000-row export. Browser tests exercise
actual downloads, the Print action, Chromium's native multipage PDF renderer,
offline production exports, read-only store/schema snapshots, loading/errors,
keyboard focus, large-print confirmation, all themes and required layouts.
Interactive operating-system print dialogs and physical printers remain manual
checks; automated PDF artifacts validate Chromium's print rendering path.
