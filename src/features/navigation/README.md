# Application navigation

The app renders one main destination at a time: Home, Transactions, Accounts, or
More. More links to the existing Categories management component at
`#more/categories`; it has a Back to More link. Categories is neither copied nor
reimplemented. More also describes the existing browser-local storage behavior.

`useAppNavigation` reads native hash navigation using React's
`useSyncExternalStore` and a `hashchange` subscription. Native anchor links create
browser history entries, preserve the destination across reload, and support
Back / Forward. Empty, `#home`, and unrecognized hashes resolve to Home. No router
or new dependency is used. The skip link focuses the current page heading without
changing the hash. Main itself is not a focus target; heading outlines fit their
text so keyboard focus remains visible without framing the whole content region.

The header's Add Transaction link opens `#transactions/new`. On Transactions,
the prominent Add action appears in the page header instead of being duplicated
in the app header. The Transactions component accepts one optional initial-editor
flag and opens its native dialog, focusing Amount when its storage load completes.
Missing accounts/categories provide direct setup links and prevent saving. A
small app-level request counter allows the global action to reopen after
save/cancel while already at the same hash. Reloading this action hash opens a
fresh new editor.

Only the active feature mounts. The transaction editor checks dirty drafts before
same-document departures, including browser Back/Forward, and restores the editor
URL before the app reads it if discard is declined. Reload/closing a dirty editor
uses the browser's beforeunload warning. See `../transactions/README.md` for the
history-entry replacement and focus-restoration behavior. Drafts, transaction
filters, and Home's selected month are not persisted. Persisted records and all
repositories, domain calculations, schema, parsing, and data-refresh events are
unchanged. Account and Category layouts remain intact.

Mobile navigation is fixed at the bottom, with four SVG icons, visible labels,
and `aria-current="page"`. More remains active while viewing Categories. Its
height/padding and the shell's bottom clearance include
`env(safe-area-inset-bottom)`. `viewport-fit=cover` enables safe-area layout on
supporting devices. At 48rem and wider, navigation becomes a compact top row.
Header, navigation, and main content share a centered 60rem (960px) content
width inside the existing shell. The desktop header and navigation share a
quiet surface, and the active destination uses an underline rather than a pill.

On initial load, the app updates the document title and scrolls to the top without
automatically focusing the route heading. On subsequent screen changes, including
Back / Forward, it focuses the heading unless the new content has already claimed
focus. A ref initialized to the resolved screen also excludes React Strict Mode's
initial effect replay. The skip link still explicitly focuses the current heading;
editor focus and existing save/cancel focus are retained. Links and controls keep
the foundation's visible focus styles and approximately 48px touch targets.

`npm run test:navigation:browser` checks development Strict Mode and the production
build (run `npm run build` first), starting its own local servers. It exercises
initial Home/deep links, pointer and keyboard navigation, Back / Forward, skip
links, same-screen actions, and modal focus in Sage, Ocean, and Dark. It uses only
a disposable Chrome profile and checks that navigation leaves its database intact.

Validation: build, lint, diff whitespace check, and isolated Chrome checks at
390×844, 320×720, and 1440×1000. Browser checks cover single-destination rendering,
navigation/focus, Categories and return, history/reload, month boundaries,
original totals and transfer exclusion, empty/income-only/transfer-only months,
unknown categories, sorting/ties, Show all/less, editor opening and exact-cent
saving, horizontal overflow, and bottom navigation clearance. Test fixtures use
a disposable Chrome profile, never the user's browser storage. Recovery from a
forced storage read failure and a 200% text-size check also pass. Safe-area padding
is implemented in CSS; a physical iOS device was not available for validation.
