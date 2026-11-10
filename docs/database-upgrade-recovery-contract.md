# Database upgrade recovery contract (5B-1 proposal)

This is a production integration contract, not implemented application UI. The
test-only native gate must run before any Dexie auto-open, settings observer,
repository, report, import, restore, or financial editor. Production remains v3.

## Admission states

`checking -> blocked | migrating -> ready`; errors enter `retryable` or
`needs-recovery`. Only `ready` permits financial reads presented as the current
ledger and financial edits. A blocked or failed gate must not mount a background
writer. Retry is an explicit user action or a response to the blocking connection
closing, never a resubmission of a financial operation.

Readiness requires an exact recognized native layout and committed control marker
in the same database: canonical stores and original indexes, guarded legacy keys,
unique link indexes, operation/control stores, supported protocol and local epoch.
Native version 40 alone is insufficient. The prototype tests wrong layout and
incomplete completion markers; it is not the final production layout validator.

| Condition | Message and allowed action | Required storage behavior |
| --- | --- | --- |
| Old connection blocks upgrade | “Another My Finance window is keeping your data open. Save any unfinished work there, then close it. This window will check again.” Offer **Check again** and an explanation of other browser/PWA windows. | Keep ledger and drafts intact. Do not force-close/reload other clients. The native upgrade remains pending or is cancelled safely by closing this new window. No editing before admission. |
| Upgrade transaction aborts | “The update did not finish. Your saved data has been kept. Try again when other My Finance windows are closed.” Offer **Retry update**. | Verify the old recognized layout before retry. An aborted versionchange rolls back store names, guards and metadata together. Do not restore from an external stale snapshot. |
| Browser interrupted before commit | “Checking your saved data after an interrupted update…” then the normal retry or blocked notice. | Inspect durable layout first. Recognized v3 retries the native transaction using the latest committed data. Never create payment links or financial records. |
| Browser interrupted after commit | Usually no recovery prompt: complete admission and open the preserved workspace. | Recognize the committed canonical layout and epoch. Do not re-run migration, re-seed, rotate epoch, or replay payment operations. |
| Storage inaccessible, denied, or out of space | “Browser storage is unavailable. Your saved data has not been replaced. Reopen this window in the same browser profile, check storage permissions or free device space, then try again.” Offer **Retry storage check** and diagnostic details. | Keep editing disabled. No empty in-memory replacement, new database namespace, fallback to legacy stores, automatic eviction, or cleanup of user data. Do not claim that browser-evicted data is still present. |
| Native version/layout or completion marker inconsistent | “My Finance cannot safely open this data layout. Your stored records have been left in place.” Offer **Retry check** and a diagnostic report containing schema/version/error identifiers, excluding financial records by default. | Fail closed. Do not complete a guessed partial migration, delete stores, reset onboarding, or repair financial data from receipt inference. A future recovery reader/export must be separately validated and must be read-only. |
| Released old app reaches legacy guards | The released app cannot be changed retroactively: tested editor saves show an error and retain the draft; bootstrap shows its existing settings error. New-client guidance: “This older window cannot save to the updated workspace. Keep any unsaved text, close it, and reopen the updated app.” | DataError/missing-record failures are enforced by native storage. Old delete/empty-restore calls can return success as harmless compatibility-store no-ops. Do not present the old UI as a usable current ledger. |

No recovery action deletes user data, suggests **Clear site data**, silently starts
an empty replacement ledger, or writes the retired stores. A manual backup must
not be a correctness prerequisite for the automatic atomic upgrade. Explicit
user-requested replacement restore is a separate, confirmed operation after the
new gate succeeds, with canonical graph validation and a rotated local epoch.

## Worker and reopening contract

Keep normal service-worker waiting. Make the compatible offline app shell available
before offering cutover, and let users close dirty old windows voluntarily.
Activation, an update banner, a Web Lock, a tab handshake and an empty client list
do not grant database admission. New/reopened tabs each validate IndexedDB before
mounting business code, including offline, BFCache and restored browser sessions.

After a native storage error, display a stable recovery page. Avoid an automatic
reload loop. Keep unsaved drafts in their existing windows and explain how to copy
them before closing; do not promise that every old editor preserves its draft.
Distinguish app update failure from ledger recovery. A theme/localStorage failure
after a financial commit must never cause the financial work to be retried.

## Required production UX verification

Exercise all states using the real gate, repositories and compiled PWA on the
supported browser/OS matrix. Verify no onboarding or empty-ledger flash, no writer
before admission, keyboard/screen-reader access to recovery, and safe repeated
retry. Include dirty editors, blocked tabs, aborted/committed process restarts,
offline launch, expired assets, storage denial/pressure, unknown layouts, and
installed desktop/iOS PWA reopening. The isolated harness does not qualify this UI.
