# Accounts experience

`AccountsSection` presents financial position with a prominent Add Account action
and two independent groups: Bank & Cash and Credit Cards. The editor mounts only
when requested. Each empty group offers a compact message and an appropriate Add
action. Routine Refresh is absent; Retry appears only after a storage read fails.
Loading, successful writes, and failures retain status/alert semantics.

`AccountList` uses restrained account surfaces, one column on mobile and two
columns within each group from 48rem. A native button covers each surface and is
named by its account heading, with a description containing its exact financial
values. Mouse, Enter, and Space can open the same editor. Names wrap without
truncation, and supporting credit values can wrap onto their own line. Group
headings and account headings preserve a navigable semantic hierarchy.

Ordering retains the existing alphabetical name comparison, with ascending ID
as a deterministic tie-breaker. Renaming can move an account within its group;
focus restoration follows the account's ID. Changing an unreferenced account's
type can move it between groups. Referenced type changes are still rejected by
the repository.

## Financial presentation

All amounts use the existing exact workspace-currency formatter. Bank and Cash show their
calculated current balance. A negative Bank balance is labeled Overdraft; negative
Cash is labeled Negative balance. Both retain the negative sign and danger
styling. Ordinary positive balances remain visually calm.

Credit Cards show Debt owed as their primary value, without treating ordinary
debt as an error. A negative calculated debt is displayed as Account credit with
its positive magnitude. This only changes presentation; the calculated and stored
values are unchanged. Configured limits show Credit limit and Available credit.
Negative available credit is labeled Over limit by and displays its positive
magnitude with danger styling. Missing limits show Credit limit not set and omit
available credit; a configured zero limit remains distinct. Overpayment can
increase available credit beyond the limit, as existing calculations permit.
Unsafe calculation failures retain the existing account-specific alert.

No aggregate summary is added. Combining negative balances or account credits
with other accounts would need additional explanation; separate account values
keep available money, debt, and account credit clear without new domain semantics.

`calculateAccountBalance`, `calculateAvailableCredit`, the shared refresh event,
and `useAccounts` are unchanged. Successful transaction changes still trigger
repository reads for mounted Accounts. Balances are never stored, and transaction
writes never alter account opening balances.

## On-demand editor

`AccountForm` follows the Transactions editor interaction pattern without changing
Transactions. A native modal dialog fills mobile viewports and is centered at
desktop widths, with a maximum 36rem width. Cancel/title/Save stay visible above
an independently scrolling body. Background scrolling is locked. Safe-area
padding and dynamic viewport height accommodate supporting mobile devices.
Focused inputs scroll into view.

New and existing accounts share the same fields: name, type, opening balance,
and an optional credit limit for cards. Concise opening-balance help explains
that it precedes recorded transactions. Existing exact parsing, trimming,
negative opening balances, optional nonnegative limits, and stable IDs are
preserved. All saves and deletes still go through the original repositories.

Name receives initial focus after loading. Tab/Shift+Tab stay inside the dialog,
Escape uses the Cancel path, and dirty fields require discard confirmation.
Same-document destination changes and Back/Forward also check dirty changes;
reload/closing the tab uses the browser's beforeunload warning. As with
Transactions, declining same-document navigation restores the editor URL with
replaceState before the app reads the destination, replacing the traversed history
entry. Drafts are local and are not persisted.

Closing or saving restores focus to the opener after any pending refresh. The
account's ID identifies its replacement surface if it moved groups; Add Account
is the fallback after deletion or if the opener no longer exists. Field errors
retain their descriptions and focus the first invalid field. Repository failures
focus a visible alert inside the editor and preserve the draft.

Delete appears only for an existing account inside its editor and requires
confirmation. Referenced accounts cannot be deleted or change type. These
integrity failures remain repository decisions, display their existing readable
messages, and keep the editor open. A read-recovery Retry retains mounted drafts.

## Validation

Build, lint, and git whitespace checks pass. Isolated Chrome checks cover account
CRUD, exact amounts, all financial presentation states, reference protections,
automatic balance refresh, reload persistence, dirty drafts, dialog keyboard
operation, recovery, long names, safe-integer boundaries, and layouts at 320px,
390px, 1280px, and 1440px. Mobile keyboard checks use a shortened viewport;
physical iOS/Android keyboard and safe-area behavior still needs device review.
