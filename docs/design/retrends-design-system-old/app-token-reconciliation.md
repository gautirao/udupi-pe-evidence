# App ↔ ReTrends Token Reconciliation

> **Direction is one-way: ReTrends Claude Design mirror → app tokens.**
> This conforms the app's runtime token layer (`src/index.css`) to the refreshed
> ReTrends mirror that landed on `main` via PR #1572. No app design was pushed up to
> Claude Design; the org-level ReTrends design system was not modified.

Branch: `fix/retrends-app-token-reconciliation` (from `origin/main` after PR #1572 merged).

---

## 1. Source files used (read-only reference)

From `docs/design/retrends-design-system/`:

- `tokens/colors.css` — brand primitives + semantic aliases (primary navy, copper, evergreen, etc.)
- `tokens/fonts.css` — Google Fonts `@import` (Plus Jakarta Sans · Fraunces · Geist Mono)
- `tokens/typography.css` — font families, weights, type scale, line-heights, tracking
- `tokens/spacing.css` — spacing scale, radii, control heights, layout
- `tokens/elevation.css` — shadow scale, focus-ring color, motion
- `README.IMPORT.md` — provenance + "map onto the app's existing theme, do not introduce a second token system"

## 2. App files changed

- `src/index.css` — **changed** (light `:root` shadcn semantic tokens reconciled to ReTrends).
- `tailwind.config.ts` — **unchanged** (already exposes the correct token bindings and ReTrends font families; see §7).
- `docs/design/retrends-design-system/app-token-reconciliation.md` — **added** (this file).

No `.tsx` / page components were edited. No colours were hardcoded in components.

## 3. Key token drift found

| # | Token | Before (app) | ReTrends source of truth | Severity |
|---|-------|--------------|--------------------------|----------|
| 1 | `--primary` | `244 81% 4%` (near-black) | navy-800 `#1B2A45` | **High** — headline drift; primary read as black, not the brand ink-navy in the mock. |
| 2 | `--ring` / `--sidebar-ring` | `0 0% 40%` (neutral grey) | `--ring` = navy-800 `#1B2A45` | Med — focus ring was off-brand grey. |
| 3 | `--secondary` | `35 30% 90%` (sandy beige) | navy-100 `#E9ECF2` (navy tint) | Med — secondary surface was a legacy warm beige, not the ReTrends navy tint. |
| 4 | `--foreground` / `--card-foreground` / `--popover-foreground` | `220 25% 15%` | text-strong / grey-900 `#111827` | Low/Med — body text was lighter & less saturated than ReTrends charcoal. |
| 5 | `--muted` | `35 20% 94%` (warm) | surface-muted / stone-300 `#E6E5E0` | Low — warm tint → ReTrends neutral stone. |
| 6 | `--muted-foreground` | `220 15% 45%` | text-muted / grey-500 `#6B7280` | Low — saturation nudged to match. |
| 7 | `--border` / `--input` | `35 25% 88%` (warm beige) | stone-400 `#D7D6D0` (hairline on canvas) | Low — warm hairline → ReTrends neutral stone hairline. |
| 8 | `--destructive` | `0 72% 51%` (neon red) | brick-600 `#B23A2E` | Low — ReTrends is explicitly "muted, no neon". |
| 9 | `--background` | `45 20% 97%` | canvas-100 `#F6F5F2` | Trivial — already near-identical; aligned exactly. |
| 10 | `--sidebar-primary` | `244 81% 4%` | navy-800 (tracks `--primary`) | Med — same near-black drift as `--primary`. |

## 4. Mapping decisions (ReTrends → app)

Every value below is the ReTrends HEX converted to the app's shadcn HSL channel format.

| App token (shadcn semantic) | ReTrends alias → primitive (HEX) | New value |
|-----------------------------|----------------------------------|-----------|
| `--background` | `--background` → canvas-100 `#F6F5F2` | `45 18% 96%` |
| `--foreground` | `--text-strong` → grey-900 `#111827` | `221 39% 11%` |
| `--card` | `--surface-card` → paper `#FFFFFF` | `0 0% 100%` (unchanged) |
| `--card-foreground` | `--text-strong` `#111827` | `221 39% 11%` |
| `--popover` | paper `#FFFFFF` | `0 0% 100%` (unchanged) |
| `--popover-foreground` | `--text-strong` `#111827` | `221 39% 11%` |
| `--primary` | `--primary` → **navy-800 `#1B2A45`** | `219 44% 19%` |
| `--primary-foreground` | `--primary-foreground` `#FFFFFF` | `0 0% 100%` (unchanged) |
| `--secondary` | `--secondary` → navy-100 `#E9ECF2` | `220 26% 93%` |
| `--secondary-foreground` | `--secondary-foreground` → navy-800 `#1B2A45` | `219 44% 19%` |
| `--muted` | `--surface-muted` → stone-300 `#E6E5E0` | `50 11% 89%` |
| `--muted-foreground` | `--text-muted` → grey-500 `#6B7280` | `220 9% 46%` |
| `--destructive` | `--negative` → brick-600 `#B23A2E` | `5 59% 44%` |
| `--destructive-foreground` | `#FFFFFF` | `0 0% 100%` (unchanged) |
| `--border` | `--stone-400` `#D7D6D0` (hairline on canvas) | `51 8% 83%` |
| `--input` | tracks `--border` (shadcn input border) | `51 8% 83%` |
| `--ring` | `--ring` → navy-800 `#1B2A45` | `219 44% 19%` |
| `--sidebar-primary` | tracks `--primary` → navy-800 | `219 44% 19%` |
| `--sidebar-ring` | tracks `--ring` → navy-800 | `219 44% 19%` |

### Brand / domain token mappings (verified already-conformant — no value change)

The app already carries the ReTrends brand accents in dedicated tokens (added under
Issue #1547). They were **verified against the ReTrends source and already match**, so
they are left unchanged:

| App token | ReTrends primitive | Conversion check |
|-----------|--------------------|------------------|
| `--copper` `18 51% 46%` | copper-500 `#B05C3A` (`--accent`) | `#B05C3A` ≈ `17 50% 46%` → matches within rounding. |
| `--evergreen` `160 60% 30%` | evergreen-600 `#1F7A5C` (`--positive`/`--trust-verified-fg`) | exact match. |
| `--plum` `254 24% 42%` | school-journey plum `#5E5286` | matches the design-source distance-chip plum. |

> **Note on `--accent`.** In ReTrends, `--accent` = copper. In the app, shadcn's
> `--accent` is a *generic interactive-hover* surface (teal) consumed by `button`
> (outline/ghost), `calendar`, `command`, `context-menu`, `dropdown-menu`, and several
> app menus. ReTrends specifies copper "use sparingly for CTAs, selection, alerts" —
> remapping shadcn `--accent` to copper would turn **every** menu/hover state copper,
> violating that guidance. The ReTrends copper accent is therefore carried by the
> dedicated `--copper` token (already used by selection/CTA surfaces), and shadcn
> `--accent` stays teal. This preserves the deliberate Issue #1547 architecture.

### Typography (already-conformant — no change needed)

ReTrends families are already wired:

- `src/index.css` already `@import`s the exact ReTrends Google Fonts URL
  (Plus Jakarta Sans · Fraunces · Geist Mono).
- `tailwind.config.ts` `fontFamily` already maps `sans → Plus Jakarta Sans`,
  `serif`/`display → Fraunces`, `mono → Geist Mono`, matching `tokens/typography.css`.

### Radius (intentional keep — documented)

- App `--radius: 0.625rem` (10px). Tailwind derives `lg = var(--radius)` (10px),
  `md = radius − 2px` (8px), `sm = radius − 4px` (6px).
- ReTrends `spacing.css`: default **control** radius `--radius-md = 8px`; **card**
  radius `--radius-lg = 12px`.
- shadcn's single `--radius` base cannot satisfy both. The current base keeps derived
  `md = 8px`, which **matches** the ReTrends control radius exactly; bumping the base to
  `0.75rem` to hit 12px cards would over-round all controls to 10px. Kept at `0.625rem`.

### Elevation / shadows (no representable change)

`src/index.css` does not define `--shadow-*` variables; cards use Tailwind's
`shadow-sm/md/lg` utilities. ReTrends `elevation.css` shadows are not represented as app
CSS variables, so there is nothing to reconcile in `src/index.css` without introducing a
new token layer (out of scope for this focused PR). Recorded for a future pass.

## 5. HEX → HSL conversion rule used

App uses the shadcn channel format `H S% L%`:

- no commas, no `deg`, no `hsl()` wrapper;
- saturation and lightness include `%`;
- e.g. `#1B2A45 → 219 44% 19%`.

Standard sRGB → HSL conversion, hue rounded to the nearest degree, S/L to the nearest
percent. (The task brief's illustrative `217 44% 19%` for `#1B2A45` was approximate; the
exact conversion is `219 44% 19%`, used here.)

## 6. App-specific tokens kept (and why)

| Token(s) | Why kept |
|----------|----------|
| `--accent` / `--accent-foreground` (teal) | Generic shadcn interactive-hover accent, referenced by button/calendar/command/context-menu/dropdown + app menus. ReTrends copper would over-apply; copper lives in `--copper`. |
| `--copper*`, `--evergreen*`, `--plum*` | ReTrends brand/domain accents (Issue #1547); referenced in discover components; already match the source. |
| `--success*`, `--warning*` | App status semantics. `--warning` is referenced (`FacebookGroups.tsx`). ReTrends positive/caution concepts are carried by `--evergreen`/brand tokens; these are retained to avoid behavioural regressions. |
| `--pin-*` | Map-pin domain colours, referenced by Leaflet marker classes in `src/index.css`. No ReTrends equivalent (app domain concept). |
| `--chart-1..5` | Data-viz series. ReTrends also defines a `chart-1..5` series; retained as conventional shadcn chart tokens for future data-viz. |
| `--sidebar-*` (surfaces) | App chrome surface with no ReTrends sidebar spec; only `--sidebar-primary` / `--sidebar-ring` were aligned to navy to track the brand action colour. |
| Entire `.dark` block | ReTrends defines only a light `:root`. There is no dark source of truth to conform to, so dark mode is left as the app's existing (app-specific) values. |

## 7. Tokens removed

**None.** Every existing token is either referenced or a conventional shadcn/brand token
with a ReTrends counterpart. Nothing was orphaned, so no removals were made (avoids
blind removal and behavioural regressions). Token *names* were unchanged; only *values*
of shadcn neutral/brand semantics were reconciled.

## 8. shadcn semantic variable names preserved

Confirmed — all required shadcn semantic names are present and unchanged in name:
`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`,
`--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`,
`--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`,
`--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`,
`--input`, `--ring`, `--radius`. Only their values changed (where drifted). shadcn
compatibility preserved — `tailwind.config.ts` keeps consuming each via
`hsl(var(--token))`.

## 9. Direction confirmation — ReTrends mirror → app only

Confirmed. Values flowed **only** from `docs/design/retrends-design-system/tokens/*`
into `src/index.css`. The app's design system was **not** pushed up to Claude Design.

## 10. No org-level Claude Design write/finalize action

Confirmed. No `DesignSync finalize_plan`, no `DesignSync write_files`, no modification of
the Claude Design org-level design system. Reconciliation read the on-disk mirror only.

## 11. No page-level redesign

Confirmed. No page components were edited, no layout/visual polish was performed, and no
discovery-page components were touched. Changes are confined to the token layer
(`src/index.css`) plus this documentation file. Appearance shifts (e.g. navy primary,
navy-tint secondary) are a direct consequence of token-value conformance, not
component-level redesign.
