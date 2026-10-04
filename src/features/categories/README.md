# More and Categories

More is a quiet utility area with one compact Categories navigation row and the
existing Local data storage explanation. It introduces no unavailable settings.
Categories remains at `#more/categories`, with More active in primary navigation
and an explicit Back to More link. The link aligns with the centered category
content. Existing transaction prerequisite links retain the same destination;
no app navigation or Transactions changes are needed.

## Management list

`CategoriesSection` presents the page heading, Add Category, and a native
Expense/Income radio filter. Filtering affects the visible list only. New entries
default to the selected type; their editor type can be changed independently.
The filter is retained during saves, edits, deletion, and refresh, but is local
state and resets to Expense after leaving the page or reloading.

`CategoryList` shows one compact list with separators and full, wrapping category
names. Native row buttons support mouse, Enter, and Space and announce the name
and category type. The list retains alphabetical name ordering, with ID as a
stable tie-breaker. Renaming can move a row alphabetically. Changing its type can
move it outside the selected filter. No permanent Edit/Delete actions appear.

Each empty type has a compact message and an Add action. Routine Refresh is
absent; Retry belongs to an actual storage error. Loading and successful writes
retain status semantics. Additional bottom clearance keeps content above the
mobile navigation when enlarged text increases its height.

## Editor and focus

`CategoryForm` follows the committed Transactions/Accounts interaction pattern.
A native modal dialog fills mobile viewports and is centered on desktop, with a
normal maximum width of 36rem. Cancel/title/Save remain above an independently
scrolling body. Background content is inert and its scrolling is locked. Name
receives initial focus after loading, Tab/Shift+Tab remain inside, and Escape uses
the Cancel path. Focused fields scroll into view. Existing focus-visible styles,
labels, associated field errors, and 48px control targets are retained.

New and existing categories use the same name and type fields. Existing IDs remain
stable. Delete appears only for an existing category inside the editor and still
requires confirmation. Repository save/delete failures focus a visible alert,
retain the draft, and keep the editor open. Name errors remain associated with
the input. Recovery Retry preserves a mounted draft.

Closing or saving returns focus to the originating row or Add action after any
pending read. If the row moved outside the filter, was deleted, or its opener no
longer exists, focus falls back to the page Add Category action.

Dirty name/type changes require discard confirmation on Cancel, Escape, and
same-document departures. Reload/closing the tab uses the browser's beforeunload
warning. As in the existing editors, declining Back/Forward/hash navigation
restores the editor URL with replaceState before the app reads the destination;
this replaces the traversed history entry. Drafts are not persisted.

## Unchanged validation and integrity

`categoryHelpers` and `useCategories` are unchanged. Names are trimmed, empty names
are rejected, same-type duplicates are rejected case-insensitively, and the same
name across Expense and Income remains allowed. Rename checks exclude the
category's own ID. The existing save hook rereads persisted names, so a stale UI
list still cannot pass its duplicate-name check.

All writes use the original repositories. Referenced categories cannot be deleted
or change type, but can be renamed. Rejections preserve both the category and
transaction references and appear inside the open editor. No repository,
schema, domain, transaction, or account semantics change. Shared refresh still
reloads mounted features after successful writes.

## Validation

Build, lint, and git whitespace checks pass. Isolated Chrome checks cover Expense
and Income creation, trimming and duplicates, cross-type names, rename and type
changes, referenced-category protections, confirmed deletion, dirty drafts,
reload, recovery, direct transaction setup navigation, and keyboard/focus behavior.
More, lists, and editors are checked at 320px, 390px, 1280px, and 1440px, with
additional 200% text-size checks. Full long names remain readable, and bottom
navigation does not cover content. Physical mobile keyboard/safe-area behavior
still merits device review.
