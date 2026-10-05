# Visual foundation

`index.css` imports `tokens.css` and `controls.css`. Tokens describe semantic roles;
Sage, Ocean, and Dark override those roles without duplicating feature styles.
The root `data-theme` attribute selects the palette; decorative Appearance previews
scope the same tokens locally. Sage retains the original palette and is the default,
with its control border darkened by one RGB step to meet 3:1 on pressed surfaces.
Ocean uses navy actions, teal progress fills, blue-gray backgrounds, and separate
green financial positives. Dark uses charcoal/navy backgrounds, elevated surfaces,
light teal actions, green positives, coral errors, and amber warnings. All three
share the same spacing, typography, and geometry.

More includes native radio choices with theme names, a visible Selected label,
and decorative previews. Changes apply immediately and store `my-finance-theme`
in localStorage independently of financial persistence. A small blocking script in
`index.html` validates and applies the preference before rendering. Unknown values
or unavailable storage fall back to Sage on startup; switching still works for the
session when storage is unavailable. Keep the key and valid values aligned with
`features/appearance/themePreference.ts`. Native color-scheme and accent-color
follow the selected palette, including date/select fields and radio controls.

The spacing scale is 4 / 8 / 12 / 16 / 24 / 32 / 48px at the default root size.
Phone gutters are 16px. Surfaces use 12px radii, controls use 8px, and small type
badges use 4px. Routine surfaces have no shadow. Overlay elevation and an editor
width token are reserved for future work. The existing 48rem layout breakpoint
remains unchanged; ordinary media-query conditions cannot use CSS variables.

System typography has separate tokens for app identity, page title, section
heading, financial hero, account balance, body, meta text, and labels. Financial
values use tabular numerals and wrap instead of truncating. Money formatting and
precision remain the responsibility of the existing CAD formatter.

Shared feature controls have a 48px minimum height and 16px text. Buttons also
have a 48px minimum width. Radio inputs retain their native size inside 48px
clickable labels. Default buttons are secondary. Existing `account-primary`,
`category-primary`, and `transaction-primary` classes alias `button-primary`.
`button-secondary`, `button-quiet`, and `button-destructive` provide reusable
variants inside feature sections. Existing delete classes alias the restrained
destructive variant. Focus outlines, invalid field boundaries, hover/pressed
states, and disabled states are shared.

`index.css` owns shared section surfaces, headings, form insets, field spacing,
labels, and error text. Feature CSS retains layout rules and feature-specific
presentation. Transaction/category items keep their existing grids and content,
using separators instead of enclosing borders. Account outlines remain.
Phone management sections use 16px
padding; wider sections use 24px. Home overrides the shared enclosing surface
with open sections and a subtle financial summary surface. Its net cash flow
uses a separate hero token; supporting values use quiet surface insets and the
account-balance size on mobile, with slightly larger type on desktop. Rounded
category progress tracks are 8px high; exact amounts and shares remain text.

The app shell uses the same action, surface, typography, spacing, radius, and
focus tokens. The compact identity, navigation label, Home content width, and
bottom navigation height have dedicated tokens. The mobile shell reserves bottom
navigation space plus the device safe area; desktop uses compact top navigation.
The desktop app bar and main content share a centered 960px maximum content
width. Desktop navigation uses a restrained underline with consistent 20px
icons. Home's detail sections form two columns on wide screens and stack on
mobile. Navigation state and focus management are unchanged by this polish.

Semantic helpers include `financial-value`, `financial-positive` / `financial-income`,
`financial-expense` / `financial-outflow`, `financial-transfer` / `financial-neutral`,
`financial-danger` / `financial-overdraft` / `financial-over-limit`, and
`financial-debt`. Debt and ordinary expenses are neutral financial information.
Action, positive, danger, and warning roles are separate tokens even where initial
colors coincide. Helpers require accompanying signs, labels, or explanatory text;
CSS cannot determine whether a number represents debt, overpayment, or overdraft.
Existing transaction type labels use these same roles. No financial meaning is
inferred from formatted amount text or DOM position.

Text colors target WCAG AA contrast. Interactive borders use a stronger role
than decorative separators: Sage's control border is approximately 3.7:1
against white. Editor backdrops, elevation, and progress fills also have semantic
roles. Validate rendered pairings and interactive states when changing theme
values. Browser-owned confirmations retain their existing behavior. This
foundation preserves feature markup, focus behavior,
validation messages, calculations, repositories, and refresh behavior.
