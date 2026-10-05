# Data & Backup — version 1

More → Data & Backup exports and imports files entirely in the browser. Files are
not uploaded. Financial data stays in the existing IndexedDB `my-finance` database,
at database version 1. Theme preference stays under `my-finance-theme` in
localStorage. Files contain private financial information and are not encrypted;
store them securely. Clearing site/browser data may erase the local database.

## Full Backup JSON

Full Backup is the recommended recovery and device/browser migration format.
Every backup uses this family:

```json
{
  "format": "my-finance-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-10-05T14:32:00.000Z",
  "currency": "CAD",
  "kind": "full",
  "sections": ["accounts", "categories", "transactions", "preferences"],
  "data": {
    "accounts": [],
    "categories": [],
    "transactions": []
  },
  "preferences": { "theme": "sage" }
}
```

`exportedAt` is an ISO UTC timestamp with milliseconds. Filenames use the local
calendar date: `my-finance-backup-YYYY-MM-DD.json`. Export reads all financial tables
in one read transaction, so related records come from a consistent snapshot.

Records preserve their existing domain shape:

- Accounts: `id`, `name`, `type` (`bank`, `cash`, `credit_card`), integer-cent
  `openingBalance`, and optional integer-cent `creditLimit` for credit cards.
- Categories: `id`, `name`, `type` (`expense`, `income`).
- Transactions: `id`, `type`, `date` (YYYY-MM-DD), positive integer-cent `amount`,
  optional string `note`, and the fields belonging to that transaction variant.
  Expense/Income use `accountId` and `categoryId`. Transfer uses `fromAccountId`
  and `toAccountId`, with different endpoints and no account/category fields.
- Preferences: `theme` (`sage`, `ocean`, `dark`).

JSON never converts cents to floating-point dollars. IDs, notes, dates, signed
opening balances, credit limits, and references remain exact. Calculated balances,
route, filters, searches, editor state, and scroll position are not exported.

Version 1 validation rejects malformed JSON, missing sections, duplicate IDs in
each entity table, unsupported fields/versions/currency, invalid record types,
unsafe/fractional cents, invalid calendar dates, nonpositive transaction amounts,
invalid references, category type mismatch, Income into credit cards, and invalid
Transfer variants. Names must be nonempty strings and notes must be strings.
Category name uniqueness remains an entry-form policy; restore preserves IDs and
does not rename or deduplicate categories. References use the same validation
policy as normal transaction writes. Invalid theme values fail validation.

## Custom Backup JSON

Custom uses the same metadata and `kind: "custom"`, with `sections` declaring
exactly what is included. The filename is `my-finance-custom-backup-YYYY-MM-DD.json`.
Users choose Accounts, Categories, Transactions, and/or Preferences. Selecting
Transactions visibly includes **all Accounts and Categories**, ensuring every
transaction has its interpretation and references. Dependent checkboxes are
checked and disabled while Transactions is selected. At least one section is
required. Preferences-only exports have an empty `data` object.

Partial custom exports are export-only. Restore accepts a Custom Backup only if
all four sections are present and it passes every Full Backup validation rule.

## CSV exports and text encoding

CSV uses UTF-8, quoted fields, doubled embedded quotes, CRLF record separators,
and exact decimal CAD amounts (for example `42.75`, `2000.00`, `-123.45`). Integer
cents are formatted/parsed through the existing BigInt-based money helpers;
symbols, grouping commas, exponents, and more than two decimal places are not
accepted as money. Account opening balances may be negative. Credit limits are
nonnegative and blank when absent or not applicable.

Each schema has a `text_encoding` column with the fixed value
`my-finance-apostrophe-v1`. **Every nonempty text field** is prefixed with one
apostrophe before CSV quoting, including IDs, type, dates, names, and notes.
An original apostrophe is therefore doubled. Empty text fields remain blank.
The prefix keeps text such as `=SUM(...)`, `+...`, `-...`, `@...`, or formulas
preceded by whitespace/control characters from being treated as spreadsheet
formulas. Some spreadsheet import modes display the literal apostrophe; that
is intentional. Numeric money columns contain only generated decimal numbers
and receive no text prefix.

My Finance verifies the marker and removes **exactly one** apostrophe from each
nonempty text field. This preserves original apostrophes, whitespace, quotes,
commas, newlines (including CRLF inside notes), and Unicode without ambiguity.
Do not remove the encoding marker/prefixes if you want a reliable re-import.

Transactions (`my-finance-transactions-YYYY-MM-DD.csv`):

```text
id,type,date,amount_cad,category_id,category_name,account_id,account_name,from_account_id,from_account_name,to_account_id,to_account_name,note,text_encoding
```

All history is exported, ordered by transaction date descending, then ID ascending.
Expense/Income populate account and category columns; Transfer populates From/To
columns. Unused columns are blank. Names aid inspection and reference mapping;
IDs retain identity.

Accounts (`my-finance-accounts-YYYY-MM-DD.csv`):

```text
id,name,type,opening_balance_cad,credit_limit_cad,text_encoding
```

Categories (`my-finance-categories-YYYY-MM-DD.csv`):

```text
id,name,type,text_encoding
```

Accounts/Categories CSV files are for inspection, spreadsheets, and portability.
They cannot be imported in this version; use Full Backup to restore entities.

## Full Restore: Replace only

Selecting a JSON file only reads, parses, and validates it. The preview shows
creation time, counts, theme, current dataset counts, and Replace mode. The
`Replace current data` action requires a separate explicit destructive
confirmation. Cancellation writes nothing. There is no Merge mode.

The entire validated graph is copied and revalidated before replacement. One
Dexie read/write transaction covers Accounts, Categories, and Transactions.
All clears and bulk writes happen in that transaction. A rejection/failed write
aborts it: either the full financial snapshot commits, or the previous financial
data remains intact. Direct table access in this dedicated operation intentionally
avoids per-entity delete protection only after validating the complete graph.
Normal account/category edit/delete integrity protection remains in place.

Only after a successful financial commit is the validated theme applied and
persisted. localStorage is not part of the financial transaction. If storing
the preference fails, financial restoration remains successful, the theme
applies for the current session, and the result explicitly reports that the
appearance preference could not be saved. It does not report total restore failure.

## Transactions CSV import

This importer supports the documented My Finance schema, not arbitrary bank
statement formats. All documented columns, including `text_encoding`, are required;
their order may vary. Duplicate/missing/unknown headers are rejected. Transaction
IDs are required: imports never manufacture IDs to hide collisions. UTF-8 input
and an optional leading BOM are supported. The state-machine parser supports
quoted commas, escaped quotes, multiline fields, CRLF/LF records, and blank rows.
Malformed quoting rejects the file; malformed records get a visible Invalid state.
Nothing is written during file selection, parsing, validation, or mapping.

Each logical row receives a status:

- **Ready:** valid and selected by default; may be deselected.
- **Duplicate:** the ID already exists with effectively identical financial
  data, or is an identical later copy in this file. Skipped. Empty/absent notes
  compare equally; other note whitespace, dates, amounts, types, and references
  are exact. Display names do not affect equality.
- **Conflict:** the same ID has different data, or repeated rows cannot agree
  on a complete identical record. Conflicting rows are never overwritten/imported.
- **Needs mapping:** references cannot be uniquely resolved.
- **Invalid:** malformed fields or a financial/reference rule is violated.

Reference resolution prioritizes exact persisted IDs. Failing that, account names
use trimmed, case-insensitive exact matches only when unique. Categories use the
same name normalization plus the required Expense/Income type. An exact category
ID of the wrong type is Invalid, not silently remapped by name. Ambiguous names
are never guessed. Users can explicitly map to existing entities. No accounts
or categories are created automatically. Income choices omit credit cards;
final validation still rejects them. Transfer endpoints must remain distinct.

Preview lists 20 rows per page. Status filtering and pagination expose every
problem row. It shows date, type, exact amount, resolved account/category or
Transfer direction, status/error, and an optional note disclosure. Only selected
Ready rows are submitted; result text reports imported and skipped counts.

Immediately before writing, the selected batch is copied and validated again
against current Accounts/Categories and transaction IDs inside **one** Dexie
read/write transaction. A stale reference or new ID collision rejects the whole
batch rather than silently skipping part of it. Bulk-write failure aborts every
selected addition. Existing records are never overwritten. The preview remains
open with an error, and current data is reread for another review.

Successful restore/import dispatches the existing shared data-refresh event.
Home, Accounts, Account Details, and Transactions read current persisted data;
balances remain derived. Transfers retain existing semantics and stay excluded
from Expense/Income totals. Object URLs used for downloads are revoked.

## Compatibility and checks

Unknown backup schema versions are rejected. Future versions must provide an
explicit, validated migration before acceptance; arbitrary future compatibility
is not promised. Encryption, cloud/automatic/scheduled backup, Full Backup merge,
entity CSV imports, PWA, and multi-currency are outside version 1.

Run `npm test` (Node 22.18+ or Node 24, for built-in TypeScript stripping),
`npm run build`, `npm run lint`, and `git diff --check`. Pure format/parser/graph
tests use Node's built-in test runner, without new dependencies. Browser checks
exercise actual IndexedDB transaction rollback, file downloads/selections,
confirmation, mapping/import, themes, responsive layouts, and focus handling.
