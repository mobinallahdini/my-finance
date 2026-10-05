# My Finance v1.1.0

Release candidate; feature work is frozen. Prepared on
`feature/v1.1-onboarding-currency` from `cf870cc`, with released `v1.0.0`
(`9f5ee76`) as the upgrade baseline. No merge, commit, push, or new tag was made.

## Highlights

- First-run onboarding with Country / Region, workspace Currency, and Fiscal year
  start; editable later in Finance Settings.
- Centralized currency formatting across financial and tracking screens.
- Existing v1.0 data upgrades safely to CA/CAD/January with setup completed.
- Full Backup JSON schema v3 includes settings, finances, tracking, and appearance.
- Currency-aware Transactions and Accounts CSV; legacy JSON/CSV compatibility.
- Optional Expense Tax / VAT and Receipt Number, including receipt-number search.
- Spending by category donut with a complete textual legend and Other grouping.
- Bills & Installments visual polish, without changes to tracking calculations.

## Storage and financial behavior

My Finance is local-first: records remain in the current browser on the current
device. Clearing site/browser data may erase them. **Export a Full Backup before
upgrading and keep it securely.** Installation does not provide cloud sync.

There is one workspace and one currency. Multiple workspaces are not included.
Only supported currencies with two decimal minor units are available. Changing
currency relabels/reformats existing integer amounts after confirmation; there
is no FX conversion. Fiscal year start is saved for future reporting and does
not change monthly totals. No new reports are included.

Expense amount remains the total paid. For total 115.00 and included tax 15.00,
subtotal is 100.00; Dashboard Expenses and account movement remain 115.00.
Income/Transfer cannot carry Expense tax or receipt metadata. Transfers and
Bills & Installments payments remain excluded from Dashboard Expenses.

V3 export requires matching file/settings currency. Full restore replaces all
six stores atomically and restores the saved theme. Valid v1, v2, and earlier v3
files remain accepted, without onboarding after restore. V1 reconstructs
CA/CAD/January/completed settings and clears tracking data, as its preview warns.
V2 without settings uses the destination country, file currency, January and
completed setup; preview explains these defaults. Legacy `amount_cad` CSV is
accepted in CAD and blocked in other currencies. Categories CSV is unchanged.
Accounts/Categories CSV remain exports; only Transactions CSV is imported.

## Deployment and PWA

The existing GitHub Pages workflow is unchanged: Node 24, `npm ci`, production
build, Pages artifact upload, and deployment on pushes to main or manual dispatch.
An isolated clean install/build passed locally with Node 24.14.0. The referenced
Actions versions resolve, and permissions/environment match
[GitHub Pages requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). The hosted workflow/deployment has not been run for this candidate.

Vite keeps relative assets (`base: './'`). The same production build supports
root hosting and `/my-finance/`, including manifest/icons, scoped service worker,
`./#home` launch, offline startup and hash navigation. Expected published address:
<https://mobinallahdini.github.io/my-finance/>. No PWA source or deployment change
was needed. Imported/exported financial files are not cached.

## Release validation

Every existing automated suite was run, with no failed or skipped regressions.
The additional `npm run test:release:browser` builds the actual tagged v1.0.0
source in a temporary directory and serves v1.0 then v1.1 assets at the same
`/my-finance/` origin. All browser profiles and financial fixtures are disposable.

| Suite | Passed checks |
| --- | ---: |
| Unit tests (`npm test`) | 371 |
| Obligation persistence | 99 |
| Bills & Installments UI | 263 |
| Backup UI | 184 |
| Onboarding/settings/migration | 99 |
| Workspace backup/CSV | 50 |
| Expense tax/receipt | 96 |
| Spending donut | 107 |
| Production/PWA | 216 |
| Actual release upgrade/currency/screen matrix | 556 |
| **Total** | **2,041** |

`npm run build`, `npm run lint`, and `git diff --check`: passed.

The real v1.0-to-v1.1 worker update waits while an old editor is open. After all
old clients leave, v1.1 activates, adds completed CA/CAD/January settings, skips
onboarding, and preserves every record, integer amount, ID, reference, note and
theme. All account/list/detail balances and dashboard totals match v1.0 exactly.
Offline reload preserves all six stores. Only obsolete app asset caches are
removed; unrelated caches remain. A subsequent update also preserves non-default
DE/GBP/July settings, all six stores, and theme through activation and offline
reload, without showing onboarding.

Fresh startup shows loading then onboarding before the main shell; only the
three intended settings are visible. Explicit currency selection and persisted
setup/reload pass. CAD/USD/EUR/GBP presentation was checked across Home, Upcoming
Payments, Transactions/filters, Accounts/Details, Bills/remaining principal,
payment forms, Tax / VAT, and backup previews. Production v3 round-trips restore
all settings, records, tax/receipt text and theme exactly. Failure injection
verifies settings/final-store rollback. CSV checks cover exact cents and metadata,
duplicates, conflicts, mapping, formula protection and currency rejection.

Donut checks cover zero/one/multiple categories, Other, Unknown category, rename,
month switching, exact totals/cents and exclusion rules. Bills checks cover month
selection, summary/filter, status/progress, partial payments, archive/delete and
Home Upcoming Payments, without creating financial transactions automatically.

All nine requested screens pass Sage/Ocean/Dark at 320px, 390px, desktop and 200%
text. Relevant editor/dialog suites verify keyboard navigation, visible focus,
focus trapping/restoration, labels, validation, textual chart alternatives and
status text independent of color.

## Findings and manual review

- **BLOCKER:** none remaining. Validation found bottom-navigation obstruction
  at 320px/200% text: wrapped labels exceeded the reserved minimum height.
  The shell now reserves the measured navigation height; all screen matrices
  were rerun. This changes layout clearance only, not navigation or finances.
- **IMPORTANT BUT NON-BLOCKING:** physical iOS Safari/Android installation,
  real-device text scaling/keyboard and hosted GitHub Pages workflow/deployment
  need manual release-candidate review. Automated Chrome emulation is not a
  substitute for those checks.
- **MINOR / FUTURE:** at 320px/200% text, long navigation labels and large
  amounts can wrap but remain fully visible; typography refinement is deferred.
  Multiple workspaces, FX conversion and new reports are outside this release.

**Recommendation:** ready for manual v1.1.0 release-candidate testing. Keep the
candidate uncommitted/untagged until the requested manual review is complete.
