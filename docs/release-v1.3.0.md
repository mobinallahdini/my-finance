# My Finance v1.3.0 release candidate

Prepared on **2026-11-10** (America/Toronto) on
`feature/v1.3-financial-reports`, from clean committed milestone head `9d8899c`.
The actual base release is Git tag **v1.2.0**, commit
`67c5d5c2f0e47d0136d400215883bf34611021e8`.
All completed milestones were committed before RC preparation. The complete
55-file milestone diff was reviewed; runtime changes are confined to navigation,
report presentation/exports, shared read-only filtering and financial summaries.
Research/prototype code remains isolated under tests and documentation.

No commit, merge, tag, push or deployment is part of this preparation.

## Release scope

The only new user-facing behavior is:

1. Initial Home navigation no longer moves focus to the heading as if it were a
   user navigation. Later route changes retain their accessible focus target.
2. **More → Financial Reports**, including current month/year, all dates and
   inclusive custom date ranges.
3. Advanced account, account-type, category, transaction-type, amount-bound and
   text filters; selectable report columns.
4. Income, gross Expenses, Refunds, net Expenses, net cash flow, Transfer volume
   and matching counts; grouping by month, category, account or type.
5. Detail **Report CSV**, **Summary CSV**, and **Print / Save as PDF**.

Bills & Installments remain tracking-only. There is no installment-account
integration, payment-generated financial transaction, new payment lifecycle,
receipt scanning/OCR, automatic reconciliation, or multiple-workspace feature.
Expense receipt numbers and included Tax/VAT remain existing manual metadata.

## Storage and backup safety

| Boundary compared with actual v1.2.0 | Result |
| --- | --- |
| `src/persistence` (all database/repository/import/restore code) | Unchanged |
| Production Dexie declarations | Exactly v1, v2, v3; current schema **3**, native IndexedDB **30** |
| Six business stores, primary keys and indexes | Unchanged |
| Domain models, obligation calculations/validation and tracking UI | Unchanged |
| Backup formats, validators and canonical Transactions CSV | Unchanged |
| Service-worker source, PWA build plugin, manifest, Vite and Pages workflow | Unchanged |
| Dependencies and resolved dependency lock entries | Unchanged |

There is no database migration, new financial store, historical rewrite/backfill,
automatic account deduction, payment conversion, or startup write to financial
tables. Existing settings bootstrap for older-than-v1.2 data is unchanged.
Reports use the existing coherent read-only Accounts/Categories/Transactions
snapshot. Prepared report rows, summaries and groups are immutable, in-memory
values; report preferences are session-only. No report cache is persisted.

The release-boundary unit checks compare these production files directly against
the Git tag, including the entire lockfile after allowing only root versions.
Native browser snapshots and write interception provide behavioral evidence in
addition to source comparison.

Full Backup remains **schema v3**. Existing v1/v2/v3 restoration, settings
reconstruction, Refund records, currency safeguards and atomic rollback remain
covered. **Report CSV is an analysis format, not a restorable Transactions CSV.**
Use Data & Backup for Full JSON Backup and the canonical import/export CSV.
Neither report format changes that CSV schema.

## Actual v1.2 → v1.3 upgrade

The historical suite archives/builds the actual released source, lets its compiled
app create the genuine database, then seeds only validated synthetic financial
data in a disposable profile. It serves the release and candidate at one random
loopback origin under **`/my-finance/`**. No user profile or production storage is
opened, restored or cleared.

The fixture includes six accounts, three categories, thirteen financial
transactions (Expense/Income/Transfer/Refund), seven Bills/Installments, thirteen
tracking payments, tax/receipts/notes, completed DE/GBP/July settings and Ocean
theme. Before/after raw IDs, optional fields, schemas/indexes, preferences and
exact UI/calculation projections are compared. A second old app tab keeps the
candidate worker waiting; both must leave before normal activation. There is no
forced activation or financial restore during the upgrade.

The deterministic historical six-store SHA-256 is:

```text
aad99ccfbe046e17e49e50e0d03e1442c04a170367e5be18dc3daf702460b5da
```

Released and candidate hashes equal that fixture hash. Accounts retain exact
opening and derived balances: Bank **366000**, Cash **21900**, debt card **50000**,
credit card **-9500**, overdraft **-2500**, card without limit **1234** (GBP cents).
Limited-card available credit remains **50000** and **59500**. Principal, payment
totals, paid dates/due months, categories, transactions, tax metadata, receipts,
settings and theme remain exact. No historical payment generates a transaction,
no financial write occurs at startup, and onboarding does not reset.

The upgraded tab reloads **offline** directly into Reports at `/my-finance/`.
Detail CSV, Summary CSV and native Chromium PDF use all historical matches and
the same screen totals; before/after snapshots and zero write interception prove
no stored record or preference changes. Generated files are absent from asset
caches. This extends the existing historical suite from 22 to **28** checks.

## Report and export acceptance

Reports and Transactions share one validated query predicate. Tests cover dates,
open/inclusive bounds, accounts and types on the same eligible Transfer endpoint,
categories, transaction types, exact amount bounds and text/receipt search.
Columns, grouping, pagination, Apply/Cancel/Clear, loading/errors, local refresh,
navigation history and deep-link reload are covered.

The on-screen overview, group values and exports consume the same frozen
`PreparedReport`. Exports neither re-filter nor recalculate its totals. Refunds
reduce net Expenses rather than increase Income; refund-only/negative-net periods
remain valid. Card purchases affect debt; card repayments remain Transfers.
Global Transfer volume counts each source transaction once. Account groups include
both endpoints and explicitly state that their counts/volumes are non-additive.
Currency formatting uses existing workspace settings, without conversion.

CSV includes all matches across pagination and selected groups, respects selected
column order, preserves exact cents/multiline text, and protects text against
spreadsheet formulas. Summary CSV equals all seven visible report metrics.
Coverage includes header-only zero matches and complete 10,000-row unit exports.
The actual browser export test uses 71 rows across pages, and 2,001-row large-print
confirmation/completeness checks.

Print includes all filtered rows, selected columns, applied criteria, summaries
and groups. Print CSS excludes application navigation/controls and uses black on
white in every theme. Chromium's native multipage PDF renderer is exercised online
and offline, including the actual upgraded fixture. **The interactive OS print
dialog, selecting a physical printer/Save as PDF destination, and other browser
print implementations still require manual checks.**

All report viewing, filtering, exports and print checks assert unchanged financial
records/settings/schema and no report-issued store writes. Generated CSV/PDF use
local Blob/native printing, with no server upload or persistent report caching.

## Automated validation and reproducibility

Node **24.13.0**, npm **11.6.2**, Chrome **157.0.8103.39**, Windows. Normal release
browser suites use disposable profiles and dedicated loopback servers; no real
browser data is read. Desktop viewport/text emulation covers Sage, Ocean and Dark,
320/390/820/1280px Reports layouts and 100%/200% text. These are not physical-device
or mobile-keyboard tests. Firefox/WebKit database-research evidence does not
qualify this report UI or Safari/iOS native print behavior.

```text
npm run build
npm run lint
npm test
npm run test:release:v13:browser
git diff --check
```

The reporting-only browser command runs all 15 applicable existing suites and
retains per-suite logs/counts plus `results.json` in its printed temporary artifact
directory. It exits zero only when every normal suite completes successfully.
The parent dev server uses its own dependency cache and preserves the original
child environment so production builds do not inherit development mode.

The shell did not have Node/npm on PATH. The already provisioned portable tools
were used; the exact command prefix was:

```powershell
$rcTools = Join-Path $env:TEMP 'my-finance-qualification-tools'
$env:Path = (Join-Path $rcTools 'shims') + ';' + (Join-Path $rcTools 'node-v24.13.0-win-x64') + ';' + $env:Path
```

Then the npm commands above ran unchanged. Temporary shims call the existing
TypeScript, Vite and ESLint entry points through that Node executable; no package
installation or dependency update was needed for RC preparation.

All 15 normal browser suites passed in the accepted run, with **2,509 browser
checks** and **628 unit tests**: **3,137** normal acceptance checks in total.
`npm run build`, `npm run lint` and `git diff --check` pass. No tests were skipped
or assertions weakened. Counts exclude repeated diagnostic runs and the separate
blocked future-feature investigation.

| Suite/command | Passed |
| --- | ---: |
| `npm test` | 628 |
| Navigation focus | 152 |
| Reports | 220 |
| Report exports/native PDF | 89 |
| Actual v1.2 historical upgrade and offline Reports/exports | 28 |
| Obligations persistence | 99 |
| Obligations UI | 263 |
| JSON backup/restore | 184 |
| Finance settings | 99 |
| Workspace backup/CSV | 50 |
| Expense tax/receipts | 96 |
| Spending donut | 107 |
| Transaction improvements/Refunds | 152 |
| Production/PWA | 216 |
| Older v1.0 production upgrade/regression | 556 |
| Older v1.1 production upgrade/Refund regression | 198 |
| **Total** | **3,137** |

Accepted logs and aggregate evidence: `%TEMP%/my-finance-v13-rc-KOj4cw`.
[Repository evidence](evidence/release-v1.3.0.json) includes per-suite counts,
assertion names, log hashes, the actual v1.2 upgrade hash/schema/projection data,
PDF artifact hash and the separate gate status.

Two initial full runs failed because of the new test runner, and are retained:

- `%TEMP%/my-finance-v13-rc-wXjJuG`: the runner's dev-server initialization leaked
  `NODE_ENV=development` into production-build suites, preventing expected workers.
  Capturing the original child environment corrected that isolation defect.
- `%TEMP%/my-finance-v13-rc-Wq5Rw4`: an actual-release build's later dev probe
  replaced a shared Vite dependency cache with a production React runtime. The
  parent's JSX-development renderer then failed with `_jsxDEV is not a function`.
  A private parent-server cache corrected this separate harness isolation defect.

Both failed aggregates and logs remain available; they are not counted as passing.
The unchanged production worker and financial code needed no fix. The direct
28-check actual-upgrade run also passed independently before the accepted full run.

## Findings and recommendation

| Classification | Finding |
| --- | --- |
| **BLOCKER** | None found in the automated reporting-only acceptance scope: no historical loss/mutation, unintended payment-generated transaction, report/export financial disagreement or offline-upgrade failure remains. |
| **NON-BLOCKING for RC** | Existing main-bundle size advisory over 500 kB. Existing development React duplicate-key warning when AccountDetails and AccountForm share the account ID; the same source exists in v1.2 and account/settings regressions pass. Neither is hidden or changed under the reporting freeze. |
| **NON-BLOCKING for RC; manual sign-off before general release** | Physical device/installed-PWA, assistive technology and interactive native-print checks below. Automated Chromium rendering is not OS print-dialog qualification or Safari/iOS testing. |
| **FUTURE FEATURE** | Installment-account linking remains production-blocked. Receipt scanning, multiple workspaces and any new payment lifecycle are not part of this release. |

**GO for the reporting-only v1.3.0 release candidate and manual acceptance testing.**
Complete the listed device/print checks before general release. This is not a
production deployment approval. **NO-GO for production linked-payment functionality**;
its separate mixed-version safety gate is unsatisfied. No commit or tag was created.

## Separate linked-payment research gate

**A reporting-only v1.3 release may proceed after its own acceptance tests pass.**
The mixed-version investigation remains **UNPROVEN for production payment linking**.
Its unsafe additive/namespace/rename-only evidence is retained and its intentional
exit code **2** is unchanged. The ordinary historical safety suite includes its
existing negative generic Dexie probe; passing that observation does not approve
linked payments. Security documents and test-only native prototypes are not
imported into production code.

The separate `npm run test:installments:compatibility` was rerun during preparation:
120 observations verified; **exit 2**, with unsafe alternatives reproduced and the
production linking gate still blocked. These are not counted as reporting release
passes. See [cross-browser qualification](database-write-fence-qualification.md).

## Remaining manual checks and limitations

- Physical iOS Safari/home-screen PWA and Android Chrome installed-PWA launch,
  offline reopen, retained records/theme and update with an old window open.
- Actual mobile keyboard, VoiceOver/TalkBack/screen-reader navigation, focus,
  200% text and long filter/amount readability.
- Native print-dialog cancel/retry/Save as PDF and printer output on supported
  browsers/OSs, including Safari and Firefox. Verify multi-page headers, notes,
  selected columns and print navigation exclusion.
- A deployment-stage check of the real GitHub Pages URL/assets/HTTPS after a
  separately authorized release; this milestone tests `/my-finance/` locally only.

Financial data remains local to one browser profile/origin/device. Browser storage
clearing/eviction, private-mode restrictions, profile/origin changes or device loss
can remove access to records. Keep secure regular Full Backups. Synthetic automated
upgrade preservation is not a guarantee against those independent storage events.
Large CSV/print jobs use browser memory; large print requires confirmation and
never silently truncates. Maximum-safe amounts can wrap aggressively at 320px
and 200% text while remaining available. No cloud sync or financial upload exists.

## RC preparation files

Modified: `package.json` (1.3.0 and separate reporting gate), `package-lock.json`
(two root versions only), `README.md` (v1.3 features/storage/export guidance),
`tests/installment-safety.browser.mjs` (additional offline upgraded Reports checks).

Created: `docs/release-v1.3.0.md`, release evidence under `docs/evidence`,
`tests/release-v13.test.mjs` (five actual-tag boundary checks),
`tests/release-v13.browser.mjs` (normal-suite runner), and
`tests/helpers/reportingUpgrade.mjs` (read-only actual-upgrade report/export/PDF
acceptance). No production application source, persistence, worker or deployment
configuration is changed during RC preparation.
