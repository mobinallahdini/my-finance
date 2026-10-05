# My Finance v1.0.0 release candidate

## Scope and storage

Version 1 includes local-first Expense / Income / Transfer tracking, accounts and
credit-card balances, advanced transaction filters, a monthly dashboard, Bills &
Installments and payment history, Home Upcoming Payments, three themes, JSON
backup/restore, financial CSV exports, Transactions CSV import, and installation
as a standalone PWA. This release introduces no financial/domain changes,
IndexedDB migrations, or backup-format changes.

Records remain in the `my-finance` IndexedDB database (version 2, five tables).
The theme remains in the existing `my-finance-theme` localStorage preference.
Storage is per browser/device and site origin. Clearing browser/site data or
browser storage eviction can erase it. Keep Full Backup JSON v2 files somewhere
safe; they protect both finances and obligation/payment history. Installing the
app does not create cloud synchronization or a second financial storage layer.
Some browsers may isolate home-screen storage from a browser tab: use backup and
restore to move records if needed, and verify them after installing.

## Production hosting and installation

Run `npm ci` and `npm run build`, then deploy **all of `dist/`** over HTTPS. Use a
canonical directory URL ending in `/`. Relative Vite assets, manifest URLs,
worker registration, launch URL, and scope support both `/` and `/my-finance/`
(including GitHub Pages repository hosting). Hash navigation needs no server
route rewrites. Directory and `index.html` navigations share the cached shell.
Localhost is suitable for testing; `file://` and ordinary remote HTTP cannot
provide service-worker installation.

Serve `.webmanifest` as `application/manifest+json`, `.js` as JavaScript, and PNG
icons as `image/png`. Allow same-origin service-worker scripts. Prefer revalidation
for `sw.js`, `index.html`, and the manifest; hashed assets can use long immutable
caching. Deploy the directory as one complete build, retaining prior hashed assets
during rollout where possible. Do not redirect missing asset requests to HTML.
No hosting account, publication, Git tag, or commit is created by this step.

The manifest uses My Finance for both names, relative `id`/`scope`,
`start_url: "./#home"`, `display: "standalone"`, and Sage canvas color `#f4f7f6`
for its theme/background. Browser install UI is browser/platform dependent.
Chromium exposes an Install command; iOS Safari supports Share → Add to Home
Screen. Standard iOS title, capable, status-bar, and 180px touch-icon metadata
are included. No push, notifications, or native capabilities are claimed.

The icons reproduce the existing three financial bars in white on Sage green
`#285547`. Source artwork is `public/icons/finance.svg`; PNGs include 192px,
512px, an opaque 512px maskable icon with the mark inside the safe circle, and a
180px Apple touch icon. To reproduce them on Windows:

```powershell
./scripts/generate-icons.ps1
```

PNG files are included as project assets; production builds need neither GDI+
nor an image-generation dependency.

## Offline and update safety

`scripts/pwaBuild.ts` generates `dist/sw.js` from the readable worker source and
the actual build output. Its revision hashes worker source, generated HTML/JS/CSS,
manifest, and icons. Installation precaches the exact asset allowlist in a single
build cache. Failed installation leaves the existing worker available.

The active worker serves that build's shell and assets from its cache, keeping
HTML and hashed assets consistent. Normal root/`index.html` navigation falls back
to the shell offline; hash routes run entirely in the app. All seven destinations
continue to read the existing IndexedDB records offline. JSON downloads/restore,
CSV export/import, and editors retain their normal browser APIs and semantics.

The worker handles only same-origin GET requests for explicitly named build assets
and shell navigation. Unknown paths, uploaded/imported files, exported files,
and Blob URLs bypass caching. It never opens IndexedDB, reads localStorage,
uploads records, or installs a second financial store. No analytics, telemetry,
external API, authentication, or backend is introduced.

Updates use the browser's waiting-worker lifecycle: **no `skipWaiting`, forced
reload, or automatic takeover of open app windows**. A newly installed build
waits while any old controlled app tab/window remains open, preserving unsaved
editors. Reloading while another old app window remains can keep the old build.
Close all app windows and reopen to use the waiting update. Activation removes
only older `my-finance-assets:<scope>:<revision>` caches for this app scope;
unrelated caches, IndexedDB, and localStorage are untouched. This follows the
[standard service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle).

Offline readiness requires the first asset precache to finish successfully.
Disabled/unavailable service workers leave the regular app usable without offline
installation. Browsers may evict caches/data or restrict private-mode storage;
installation does not replace a backup.

## Theme and mobile behavior

The existing preference is read in the HTML head before styles and React render.
Small initial theme styles give Sage, Ocean, and Dark their canvas/background and
native control color scheme before visible application rendering. Theme-color
metadata follows subsequent theme changes without introducing a new preference.
The OS-managed launch/splash screen uses manifest settings; it cannot read the
app's localStorage theme and may show the manifest's Sage background briefly.

`viewport-fit=cover`, safe-area padding, existing fixed mobile navigation, and
dynamic-height full-screen dialogs remain in use. Shell/navigation and dialog
side padding accommodate device cutouts; existing editor focus, scrolling,
keyboard containment, dirty-draft guards, and bottom clearance are retained.
No screens have been redesigned.

## Validation and remaining device checks

With Node 24 and Chrome installed:

```sh
npm run build
npm run lint
npm test
# Run a Vite dev server separately for the three existing browser suites:
npm run test:obligations:browser
npm run test:obligations:ui
npm run test:backup:browser
# This suite hosts the real dist build itself; no dev server is used:
npm run test:pwa:browser
git diff --check
```

Existing browser suites accept `BILLS_APP_URL`; all suites accept `CHROME_BIN`.
The production suite uses an isolated temporary Chrome profile, hosts the build
at both root and subdirectory paths, and retains test downloads/screenshots in a
temporary review directory. It checks manifest/installability diagnostics, PNG
decoding, offline routes/IndexedDB, financial totals/balances/filtering, bills and
installment history, exact JSON round trips, CSV downloads/import, all themes at
320px/390px/desktop and 200% text, dialogs, and a reduced keyboard-sized viewport.

The release-critical update test seeds recognizable data through production
Restore, creates a genuinely different second Vite build in a temporary output
directory, installs its waiting worker while a dirty editor remains open, then
leaves the last old client and reopens. It compares all five tables and all
localStorage entries exactly before/after, verifies old asset-cache cleanup and
unrelated-cache preservation, and reloads the new build offline.

Headless Chrome diagnostics verify install eligibility, not a physical home-screen
installation. Physical iOS/Android installation, OS splash/status-bar appearance,
device safe areas, and real virtual-keyboard behavior still need device review.
Chromium checks cannot establish Safari/Firefox behavior. Before public release,
perform those checks on target devices and verify storage/backup downloads in the
chosen installed browser context. No known automated release blocker remains
after the required suites pass.
