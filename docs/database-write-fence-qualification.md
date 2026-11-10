# Cross-browser database write-fence qualification — milestone 5B-1

**Recommendation: STOP the payment-linking release.** The isolated guarded
canonical-store strategy is **PROVEN SAFE FOR TESTED PATHS** on the three engines
below. Production integration and installed-PWA qualification remain **UNPROVEN**.
This milestone changes tests, prototypes and documentation only. No production
schema, repositories, worker, financial linking, or recovery UI is implemented.

## Preflight and provenance

Run date: **2026-11-10**, America/Toronto. Branch:
`feature/v1.3-financial-reports`. Working tree was clean before work. Previous
investigation: `f4bcfe948a3105e00168b12e8e982b37f8388bd6`; historical safety baseline:
`80e7d15`. No commit, merge, tag, push or deployment was performed.

The harness archives Git tag **v1.2.0**, verifies commit
`67c5d5c2f0e47d0136d400215883bf34611021e8`, and executes its unchanged repositories,
restore implementation and compiled application. Installed Dexie **4.4.6** matches
the release lockfile. The release initializes native IndexedDB **30**; test-only
native cutover targets **40**. Production remains at Dexie schema v3.

All financial operations use synthetic 5A fixtures in fresh disposable profiles
and random loopback test origins. Abrupt termination targets only an owned helper
process tree with its own temporary persistent browser profile. No developer
profile, developer localhost IndexedDB, or production GitHub Pages storage is
accessed or cleared. Portable Node **24.13.0**, Playwright **1.65.0**, Firefox build
**1572** and WebKit build **2388** were provisioned in the system temporary directory.
No runtime or checked-in development dependencies were added.

## Per-engine classification

| Engine actually executed | Environment | Assertions | Guarded database result |
| --- | --- | ---: | --- |
| Chromium / Chrome **157.0.8103.39** | Windows, headless Chrome/CDP; Playwright persistent profile for process termination | 120 | **PROVEN SAFE FOR TESTED PATHS** |
| Firefox **159.0** | Windows, Playwright Firefox build 1572 | 120 | **PROVEN SAFE FOR TESTED PATHS** |
| WebKit **27.2** | Windows, Playwright WebKit build 2388 | 120 | **PROVEN SAFE FOR TESTED PATHS** |

Windows Playwright WebKit does **not** qualify Safari/macOS, iOS storage lifecycle,
or home-screen PWAs. Those environments remain **UNPROVEN**.

## Tests executed on every engine

The same actual-release repository matrix and native preservation assertions run
on each engine, plus actual compiled PWA/editor checks. Every assertion and
operation outcome is retained in [the compact evidence](evidence/database-write-fence-5b1.json).

| Scenario | Observed result on all three engines |
| --- | --- |
| Real v1.2 initialization, old connection held open | Exact six-store native-30 fixture; old JavaScript remains in memory through versionchange |
| Raw explicit old-version open | VersionError, followed by actual old Dexie's successful versionless fallback; version number alone is no fence |
| Blocked upgrade, then close blocker | Uncooperative native connection prevents partial cutover; closing it permits the pending upgrade |
| Historical and linked payment replacement | Rejected; exact canonical records, links and receipts retained |
| Historical transaction and linked Expense replacement | Rejected; exact ledger and payment agreement retained |
| Linked payment deletion | Harmless successful no-op against compatibility stores; canonical payment and receipt remain |
| Linked financial deletion, including reopened old client's Card Transfer delete | Harmless successful no-op; canonical transaction and link remain |
| Account/category/obligation/transaction additions | Rejected; direct valid account/obligation adds exercise native DataError from absent compound guard keys |
| Settings saves, including explicitly confirmed currency change | Rejected; canonical settings remain intact |
| CSV batch import and full workspace restore | Rejected; canonical financial records and receipts unchanged |
| Two concurrent old-tab restores | Both rejected; canonical ledger unchanged |
| Full offline replay of all 14 repository attacks | Each rejected/no-op result preserves canonical records and receipts |
| Old empty restore | May clear compatibility stores and their UX marker; canonical ledger unchanged |
| Duplicate canonical transaction claim | ConstraintError; paired test payment and receipt both roll back |
| Abort after each of six store moves | Exact original schema/data restored; retry succeeds; repeated completion changes neither records nor epoch |
| Upgrading tab closed before commit | Original native-30 fixture retained; new tab retries safely |
| Abrupt browser-process termination before commit | Persistent profile reopens with exact original native-30 state; retry succeeds |
| Abrupt process termination after commit | Exact canonical state and epoch survive; repeated gate neither reposts nor changes records |
| In-flight old payment correction | Upgrade waits for its commit and includes the latest corrected note, preserving exact financial values |
| Competing new migration tabs | Second waits, observes one completed layout, runs no migration steps and creates no second epoch |
| Correct native version, wrong layout | Admission rejected rather than accepting additive layout as guarded completion |
| Deliberately incomplete completion marker | Admission rejected without resetting or modifying canonical data |
| Canonical Dexie binding after native gate | Exact canonical data readable at native 40 without schema repair |

The native transaction renames stores. Exact copies means logical record identity,
field values/absence, keys and indexes survive this metadata move; it does not
duplicate the ledger. Migration creates **zero financial transactions and zero
historical links**. Only after preservation assertions, explicit fixture setup adds
two payments on a new synthetic installment, linking an existing Expense and Card
Transfer. That setup creates no financial transaction.

## Hashes and financial preservation

The normalized historical six-store SHA-256 agrees across all engines before
cutover, after every abort/retry, after old attacks and after process restarts:

```text
aad99ccfbe046e17e49e50e0d03e1442c04a170367e5be18dc3daf702460b5da
```

Evidence separately records canonical hashes including the two explicit fixture
links, receipt hashes, and expected/actual hashes for the deliberate last committed
old note correction. The corrected-note hash legitimately differs from the original;
its expected/actual hashes match. No financial fixture expectation was weakened.

| Account | Preserved signed balance, integer GBP cents |
| --- | ---: |
| Bank | 366000 |
| Cash | 21900 |
| Debt card | 50000 debt |
| Credit card | -9500 debt (9500 credit) |
| Overdraft | -2500 |
| Card without limit | 1234 debt |

Available credit stays **50000** and **59500** for the limited cards. All **13**
historical transactions and **13** historical payments retain exact fields/IDs,
tax, receipts, notes, dates and due months. Installment paid/remaining cents stay:
partial **30000/70000**, completed **50000/0**, overpaid **12000/0** with **2000**
excess, future **0/30000**, inactive **6000/14000**. Principal, monthly projections,
opening balances, settings and categories match the independent fixed 5A baseline.
The production/PWA checks preserve the Ocean theme.

## Old/new app and PWA coexistence

Separate tests exercise old JavaScript in memory, a waiting candidate worker,
activated candidate worker, offline old UI, a new canonical prototype reader,
browser reload and browser-tab reopening with the updated shell.

Every engine reproduces the **unsafe additive** counterexample through the real
offline old transaction editor: a linked Expense changes **25000 -> 25001** cents.
Firefox/WebKit exercise that edit while the worker waits, then close controlled
clients for normal activation. Chromium also uses debugger-forced activation with
old JavaScript retained. This instrumentation does not change production workers.

With guards, the tested old editor reports save failure and retains its 250.01
draft. Reloading cached v1.2 offline shows its existing local-settings error,
without onboarding reset. A new prototype reader still reads every canonical
record and both links. Normal worker activation after old clients close and
reopening the candidate shell preserve the complete canonical graph.

The candidate shell still uses production **v3 repositories**, so it also shows a
bootstrap recovery error against guarded storage: **production integration is not
ready**. Browser-tab reopening is not installed desktop/iOS PWA reopening, which
remains UNPROVEN. Activation is never accepted as a database write fence.

## Negative evidence and failed environments

The additive layout, new-code-only flags/Web Locks, unretired namespace copy and
rename-only migration remain **PROVEN UNSAFE** on every engine. Actual old Dexie
repairs missing unguarded legacy stores at native **41**, allowing a competing
ledger. No negative assertion was removed. Successful old delete/empty-restore
no-ops also remain an obsolete-client UX risk despite canonical protection.
After an old empty restore clears the compatibility marker, v1.2 bootstrap's
`hasData()` can infer an empty workspace from those compatibility tables. This is
a source-derived availability risk, not a tested promise of an upgrade notice.
Canonical records remain protected; production must never bind the new app to
those empty tables or allow that appearance to become a replacement ledger.

Early incomplete runs remain preserved under `%TEMP%`:

- `my-finance-write-fence-5b1-hYJMWr`: Firefox/WebKit context-wide offline mode
  prevented the probe's first Dexie download. The corrected setup loads the new
  reader before taking the context offline. No database assertion was weakened.
- `my-finance-write-fence-5b1-LmcuK1`: interruption-helper setup failed before valid
  process-termination evidence. The helper was corrected before the accepted run.

Incomplete engine runs were UNPROVEN. Initial validation also encountered absent
Node/npm, missing Windows tsc/eslint shims and restricted-shell spawn EPERM.
Portable tooling and temporary shims enabled successful validation. Legacy backup
suite first attempts lacked their required server and failed with connection
refused; they were rerun with a dedicated random-port test server and isolated
profiles. These failed attempts are not counted as passing checks.

## Recommended migration and required production integration

Continue with **one atomic native canonical-store rename plus incompatible legacy
guard keys**. Keep all six guarded old names permanently so old Dexie cannot
repair a parallel ledger. Completion and control epoch commit in that transaction.
The compatibility account marker supports bootstrap UX only; old empty restore
can clear it, so it is not an integrity boundary.

Release blockers and required tests:

1. Native gate before every Dexie auto-open and complete canonical binding of every
   production repository, report, snapshot, settings, import/export and restore.
   Never fall back to legacy stores or initialize an empty replacement ledger.
2. Fresh/empty installs, v1/v2/v3, schema-patch versions, target collisions, malformed
   legacy records, wrong indexes/layouts, denied storage and physical quota pressure.
3. Real supported Safari/macOS/iOS and Firefox/Chromium OS versions, installed PWAs,
   BFCache, restored sessions, offline launch, worker-disabled entry points, asset
   availability and eviction. Owned process termination is not physical power-loss
   or device-level durability evidence.
4. The [non-destructive recovery UX contract](database-upgrade-recovery-contract.md)
   through the actual compiled app: no empty-ledger/onboarding flash, no editing
   before admission, useful retry and preserved drafts. Old successful no-ops must
   not encourage continued use of an obsolete ledger.
5. Full Backup v4/canonical imports/restores, complete graph validation, receipts,
   rotated epochs and stale-writer rejection. Theme failure must not replay money.
6. Final payment-service tests from [5A](installment-payment-safety.md): atomic
   posting, idempotency, ownership, unique claims, revisions, edit/delete races,
   retired retries and restoration. Financial linking is not implemented here.

| Dimension | Status |
| --- | --- |
| Isolated guarded browser compatibility | PROVEN SAFE FOR TESTED PATHS on the exact three engines |
| Synthetic user-data integrity in those paths | Exact hashes and financial values preserved |
| Production gate and canonical repository integration | UNPROVEN; release blocker |
| Worker waiting/activation and offline browser tabs | Tested as described, independent of the storage fence |
| Installed desktop/Safari/iOS PWA update/reopening | UNPROVEN; release blocker |
| Complete financial-linking rollout | UNPROVEN; **STOP** |

## Reproduction and validation

Use Node 24 and existing repository dependencies. Chromium uses installed Chrome
(`CHROME_BIN` optionally overrides it). Firefox/WebKit use an optional external
Playwright installation: set `FINANCE_PLAYWRIGHT_MODULE` to its absolute `index.mjs`
and `PLAYWRIGHT_BROWSERS_PATH` to its browser cache. The suite downloads nothing.
Missing engines remain UNPROVEN. Abrupt process-tree tests currently require
Windows and the external driver; other environments explicitly record the limit.

```text
npm run build
npm run lint
npm test
npm run test:installments:safety
npm run test:installments:qualification
git diff --check
```

Qualification intentionally exits **2** when observation assertions complete: the
production release remains UNPROVEN and unsafe alternatives remain unsafe.
Unexpected harness errors exit **1**. The accepted run completed **120 assertions
per engine (360 total)**. The existing unit suite passed **623 tests**; the unchanged
historical browser suite passed **22 checks**. Build and lint pass; build retains
its existing large-bundle advisory. Related backup suites passed **184 JSON backup**
and **50 workspace backup/CSV** browser checks on the dedicated test server.

Accepted raw reports/logs and aggregate `qualification.json` are retained at
`%TEMP%/my-finance-write-fence-5b1-M36AwW`. The preceding complete run
`my-finance-write-fence-5b1-1egQpk` also completed 120 assertions per engine.
Repository evidence includes report SHA-256s,
versions, every assertion, old outcomes/errors, native-open events, fixture/graph
hashes, financial projections, aborts, restarts and unsafe counterexamples. Generate
compact evidence from another retained run with:

```text
node tests/database-write-fence-evidence.mjs <run-directory> <output-json>
```

No commit was created. The release blocker remains open.
