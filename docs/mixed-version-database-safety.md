# Mixed-version database safety — milestone 5B-0

This is an investigation and disposable prototype, not a production migration or
linked-payment implementation. Production source, schema v3, backup formats and
worker behavior are unchanged. The additive v4 proposal in the 5A contract is
**PROVEN UNSAFE** against the actual released v1.2.0 writer.

The recommended architecture to carry into 5B is an **atomic canonical-store
cutover with unwritable compatibility stores in the same database**. Its tested
data-protection paths are **PROVEN SAFE in the recorded Chromium environment**.
Full production readiness is **UNPROVEN**: production bootstrap/repositories,
other browsers, recovery UI, and the final linked-payment service do not exist yet.

## Evidence and scope

The harness pins `v1.2.0` to commit
`67c5d5c2f0e47d0136d400215883bf34611021e8`. It archives that exact tag, imports its
unchanged database/repository/restore/settings modules through an isolated Vite
server, and builds its actual production PWA. Installed Dexie is checked against
the released lockfile: **4.4.6**. Production UI evidence uses the released 494.78 kB
minified bundle, not a rewritten mock writer. The recorded browser is
**Chrome/157.0.8103.39 on Windows**; other browser engines are not tested here.

All profiles, incognito contexts, origins and source copies are disposable.
Origins are random `http://127.0.0.1` ports. The prototype itself rejects non-loopback
origins. No developer browser profile or GitHub Pages deployment is accessed.
No dependencies are downloaded. Prototype code lives under `tests/fixtures` and
is served only by the test harness, never imported into the application build.

The 5A synthetic fixture supplies all historical data and fixed expected amounts.
Its canonical six-store SHA-256 is
`aad99ccfbe046e17e49e50e0d03e1442c04a170367e5be18dc3daf702460b5da`.
Every migration preservation assertion compares raw IDs/fields, exact account
balances, available credit, principal, monthly obligation amounts, categories,
settings and metadata against that fixture. A deliberate old-user correction is
treated separately from migration mutation and must survive as the last commit.

Only after a migration passes its preservation check does explicit fixture setup
create a new synthetic installment and two payments, linking the existing
`card-purchase` Expense and `repay-debt` Card Transfer. It creates **no financial
transaction** and converts **no historical payment**. These are controlled link
fixtures, not the final payment service or an automatic migration action.

## Results by strategy

| Strategy/property | Classification | Evidence and limit |
| --- | --- | --- |
| Raw native open with explicit old version 30 against native 40 | PROVEN SAFE for rejecting that one raw call | IndexedDB reports VersionError; this does not describe Dexie's fallback |
| Existing names + additive v4 + optional link fields + unique indexes | PROVEN UNSAFE | Actual old repository replacement, edit, deletion and restore corrupt the new graph |
| New-code flag / exclusive Web Lock as the only fence | PROVEN UNSAFE in the tested case | The old writer commits while the new tab holds the exclusive lock and control metadata exists |
| Separate versioned database, copying without retiring the old source | PROVEN UNSAFE as a single-ledger migration | New records are isolated, but old source commits diverge after the copy |
| Separate DB plus a complete durable source-retirement protocol | UNPROVEN | No cross-database atomic retirement mechanism is implemented here |
| Renaming stores but omitting compatibility guards | PROVEN UNSAFE as a retirement fence | Old Dexie repairs missing legacy tables, increments native version, and accepts a competing old ledger |
| Atomic canonical-store rename plus legacy stores with incompatible keys | PROVEN SAFE for the tested old writer/UI matrix | Canonical records, links and receipts remain unchanged under actual v1.2 calls, reopen, restore, and offline UI attempts |
| PWA worker waiting behavior | PROVEN SAFE for delaying normal asset activation in these tests | It does not prevent an uncontrolled same-origin page from opening/upgrading IndexedDB |
| Worker activation/reload as a database fence | PROVEN UNSAFE | Old in-memory production UI writes offline after debugger-forced activation |
| Complete production rollout of the recommended structure | UNPROVEN | No production implementation, multi-engine evidence or complete recovery UX yet |

## What actual v1.2 code does

The current and released `src/persistence/database.ts`, repositories,
`dataBackup.ts`, and worker source have the same relevant implementation.
The installed Dexie logic is observable in `node_modules/dexie/dist/dexie.mjs`:

- Its default versionchange handler closes the old connection with auto-open
  enabled. The tab's JavaScript and unsaved state remain in memory.
- A later request initially opens native version 30. On VersionError, Dexie retries
  with no explicit version and accepts native 40.
- `verifyInstalledSchema` checks declared tables/indexes. It does not make a newer
  database read-only merely because old declarations were used.
- If known tables are missing, the schema-patch path creates them. The rename-only
  experiment observes native version **41** and a successful old account add.

With additive v4, the exact observed operations are:

| Old call | Observed result |
| --- | --- |
| Edit historical payment with the valid v1.2 shape | Succeeds after upgrade |
| Read a linked payment and spread all returned fields into update | RangeError: unsupported/cross-type payment fields; no change |
| Reconstruct the same payment using only old known fields, then update | Succeeds; removes transactionId/mode/ownership/operation fields |
| Edit linked Expense amount through repository | Succeeds; amount no longer agrees with the payment |
| Delete linked payment | Succeeds; applied receipt becomes orphaned |
| Delete linked financial transaction | Succeeds; payment references a missing transaction |
| Explicit database close and reopen | Succeeds against native version 40 |
| Already loaded old writer runs offline | Succeeds without consulting new protocol/flags |
| Full workspace restore using the original v1.2 function | Succeeds, replaces old-known business stores, leaves new operation records inconsistent |

The unique index itself still works: a duplicate live transaction claim initially
fails with ConstraintError and rolls back its paired receipt. Once the old writer
removes the indexed field, that key is free for another payment. This is a loss of
business linkage, not a violation of IndexedDB's unique-index implementation.

Nuance: v1.2 has a repository payment-update API but no payment-edit screen. The
replacement experiment invokes that unchanged deployed API with a valid old shape;
it does not claim that a nonexistent old payment-edit UI was exercised. The
transaction-edit counterexample **does use the actual production UI**.

## PWA evidence is independent of database safety

The harness keeps two actual released app tabs open, installs the candidate's
real assets and observes a waiting worker. An uncontrolled same-origin prototype
page can nevertheless upgrade the database; worker waiting is not an IDB lock.

It then uses **DevTools `ServiceWorker.skipWaiting` only in the disposable test**.
This does not modify worker source and is not normal application behavior. New
worker activation leaves the old page's memory marker and old script URLs intact.
With network disabled, that old UI changes `card-purchase` from 25000 to 25001
cents and saves successfully, breaking its link agreement. A later offline reload
uses the candidate's cached Reports-capable shell but does not repair that link.

In the guarded prototype, an old transaction editor with a 250.01 draft instead
reports a blocked save and retains the draft in this tested run. Offline reload
of the cached old app reaches its existing recoverable bootstrap error:
“Local settings could not be loaded...” rather than resetting onboarding. The
online prototype v4 client still reads every canonical record and valid link.
This generic old-version error is an availability/UX limitation, not a finished
upgrade notice. Do not force activation/reload of dirty old clients in production.

## Recommended storage fence to develop in 5B

Within one **native IndexedDB versionchange transaction** on `my-finance`:

1. Rename each existing business store to `v4_<originalName>`. Keep its records,
   primary keys and existing indexes unchanged. This is a native metadata move,
   not financial-record transformation or a second ledger copy.
2. Recreate the six old store names with compound primary key
   `[__my_finance_retired_v4__, id]`. Retain their old secondary indexes. A normal
   valid v1.2 payload has no guard-key field, so native add/put cannot store it.
3. Put a non-business retirement marker in a compatibility store for old bootstrap
   behavior. Never treat this marker as an Account or export it. It is UX support,
   not the financial integrity boundary: an old empty restore can clear it while
   canonical data remains protected.
4. Create the new receipt/control stores and sparse unique link indexes only in
   the canonical payment store. No historical record receives a link/mode/revision.
5. Commit a completion/layout marker with the new local epoch in that same
   transaction. Validate the actual layout as well as version on repeat opening;
   a native-40 database with an additive layout is not a completed guarded cutover.

Old code still points at the old store names. Its updates fail missing-record or
reference checks; adds/puts fail DataError; deletes may resolve successfully but
target only empty compatibility stores and cannot reach canonical linked rows.
The exact old restore/import/settings/account/category paths are tested as well
as payment/transaction operations. Confirmed currency changes are tested separately
so application confirmation is not mistaken for the native guard.

Canonical one-to-one indexes continue rejecting duplicates, and the fixture's
paired operation/payment insert rolls back together on that constraint failure.
This is not a replacement for 5A's final atomic/idempotent payment service.

The same-store-name aliases must remain unwritable. Removing them is insufficient:
old Dexie recreates missing tables. Merely copying records to a new physical
database also leaves old clients with a fully writable parallel ledger. A more
complex two-database protocol could be investigated, but is not proven here.

This fence is scoped to **unchanged released application code and its normal
UI/repository calls**, not arbitrary same-origin scripts that deliberately address
new store names, DevTools, extensions, database deletion by the user, or browser
storage eviction. It is a compatibility boundary, not an authorization system.

## Why this needs a native pre-open gate

Dexie's ordinary upgrade implementation rejects changing an existing primary key
before running a content-upgrade callback. Do not assume that appending a normal
`.version(4).stores(...)` with different old keys can perform this design.

The prototype completes the native cutover **before** binding a new Dexie client
to the complete canonical/compatibility schema. The harness then opens that new
client and reads canonical data without another schema repair. Production must
design/test this boot ordering before any settings observer, repository read,
report or other Dexie auto-open. Every business repository/snapshot/import/restore
must address canonical stores after the gate. Do not fall back to the old empty
tables when canonical data exists. This integration is still UNPROVEN.

## Failure, concurrency and recovery evidence

- A deliberately uncooperative native connection blocks upgrade at v3; nothing is
  partially moved. Closing it lets cutover finish.
- Aborts after moving stores 1, 3 and 6 restore the exact native-30 schema and fixture
  hash. Retry preserves all expected balances; repeating a completed cutover does
  not reseed, change epoch, or post financial records.
- Closing the upgrading browser tab while its versionchange transaction is held
  before commit rolls back the unfinished transaction. A fresh tab retries safely.
- An in-flight write using the actual old repository and Dexie transaction commits
  before cutover. The last payment-note correction appears intact in canonical
  data; no stale external snapshot overwrites it.
- Two competing new prototype tabs converge on one committed layout. The second
  does not rerun migration steps or generate another control epoch.
- Wrong-layout completion at the correct native version rejects rather than
  silently accepting a different strategy's partially compatible database.

These observations cover tab termination and explicit transaction abort, not a
physical power failure, process/OS crash durability, real quota exhaustion or all
browser implementations. No migration creates an Expense or Transfer; absence
of a link never triggers a financial operation. The explicit setup fixture links
existing transactions without adding deductions. Final payment-service crash and
idempotency guarantees still require the 5B operation tests in the 5A contract.

## Minimum safe production sequence (proposal, not implementation)

1. Finalize versioned store names, manifest/layout rules, native gate and canonical
   Dexie binding. Test fresh v4 initialization and v1/v2/v3 inputs, not just this
   populated v3 fixture. Unexpected versions/layouts fail closed without reset.
2. Prepare and verify a complete offline-capable v4 app shell. Keep normal worker
   waiting behavior; let users close old tabs/dirty editors voluntarily. No manual
   financial backup is required for correctness of the atomic move.
3. Before any application data access, acquire the native exclusive upgrade. If
   blocked, explain the outstanding client and preserve storage. Do not force-close
   another tab or infer permission to discard a draft.
4. Atomically move the latest committed records, create guarded legacy names and
   new metadata, and commit completion. No historical-data backfill, balance
   correction, payment linking or automatic posting occurs.
5. Validate the completed native layout/manifest, bind only canonical business
   repositories, then initialize settings/reports/UI. Never create a second empty
   workspace because old compatibility stores contain no business records.
6. Implement/test v4 Full Backup/import/restore against canonical data and durable
   operation receipts; exclude compatibility markers. Preserve legacy restore
   semantics and rotate the cooperative new-client epoch atomically.
7. Enable explicit linked payments only after the final service proves atomic
   creation, ownership, one-to-one constraints, revision checks, idempotent retry
   and deletion/restore tombstones. A schema migration is never a posting command.
8. On pre-commit interruption, retry from unchanged source. On post-commit startup,
   recognize the completed layout rather than migrating or deducting again.
   On unknown/incomplete layout, retain records and show recovery; do not recreate
   financial transactions from receipts or recalculate historical balances.

## Remaining release risks / required 5B acceptance tests

**UNPROVEN** until tested/implemented:

- Native rename/guard and Dexie behavior on supported Safari/iOS and Firefox,
  installed PWAs, process termination, OS restore/BFCache and storage pressure.
- Production native-gate ordering and all canonical repository/read/write paths,
  including finance settings, reports, CSV, Full Backup v4, imports and restores.
- Fresh/empty installs; schema v1/v2; unexpected native schema-patch versions;
  preexisting target-name collisions; malformed legacy records and index failures.
- A complete usable recovery/update experience for offline old apps. Old deletion
  calls can be successful no-ops; users must not be misled into using an obsolete
  ledger. The observed retained dirty draft does not prove every editor/lifecycle.
- Physical quota and OS/browser interruption behavior beyond the injected abort
  and closed-tab scenarios. Restore preference/localStorage atomicity remains
  separate from financial-store atomicity.
- All final linked-payment service scenarios: owned/borrowed links, Card Transfers,
  Refund semantics, edit/delete races, two-tab duplicate submissions, retired
  creation retries, backup restoration, and stale pre-restore requests.
- Other released client tags and any service-worker-disabled or uncontrolled entry
  path supported in production. The new data path must remain safe independently
  of client handshakes, Web Locks and worker activation timing.

Run the same old-client attack matrix after implementing production canonical
storage. Required assertions are unchanged canonical hashes/financial values and
valid references, not merely “some error occurred.” Also verify that rejected/no-op
old writes never alter links, one-to-one claims, operation receipts or principal.
Retain the unsafe additive/namespace/rename-only counterexamples as regression
evidence; do not weaken their observations to make a release gate green.

## Reproduction and outputs

With existing dependencies and Chrome installed:

```text
npm run build
npm test
npm run test:installments:compatibility
```

The compatibility command intentionally returns **exit code 2** when investigation
assertions complete but the release gate is unsafe/unproven. Unexpected harness
assertions/errors return 1. The additive proposal fails; do not describe the entire
compatibility command as a release PASS because its observation assertions hold.

It prints a temporary artifact directory containing `report.json`, actual browser
version, tag/Dexie provenance, operation results/errors, native open/versionchange
events, raw database states, worker evidence and fixture hashes. A failed harness
also writes `partial-report.json` to retain already observed counterexamples.

To reproduce the unsafe additive case, follow the harness sequence: create the v3
fixture through released repositories; open native v4 with old names retained;
seed explicit test links; invoke the released payment update with only old fields,
or delete/edit its linked transaction. Observe lost/mismatched references and the
VersionError → versionless reopen sequence. To reproduce the guarded comparison,
run those same old APIs after native rename and incompatible legacy keys; compare
canonical data and receipts before/after, not only the returned Promise result.

Test files:

- `tests/mixed-version-safety.browser.mjs`: actual released-code and PWA scenarios.
- `tests/fixtures/mixed-version/prototype.mjs`: isolated competing native schemas,
  explicit link fixtures, read-only integrity diagnostics and Dexie binding probe.
- `tests/helpers/compatibilityBrowser.mjs`: disposable Chrome/CDP lifecycle.
- `tests/mixed-version-safety.test.mjs`: integrity-diagnostic cases and production
  boundary checks. These tests do not implement or approve a final payment service.
