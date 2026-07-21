# Listing detail page — architecture & implementation guide

> For an engineer or Claude Code agent implementing the buyer-facing **Listing detail** page in production.
> This describes the *mock* in `ui_kits/discover/` (React 18 + Babel-in-browser, ReTrends design system) and how to reproduce it in a real codebase (React + Vite + Tailwind v4 + shadcn/ui, per `readme.md`).

---

## 0. What this page is

A single buyer-facing property-detail screen for the ReTrends real-estate portal. **One page adapts to five non-agricultural property types** — `apartment`, `house`, `villa`, `plot`, `commercial` — by conditionally rendering type-appropriate spec fields instead of showing empty fields. It also renders several **UI states** (default, loading skeleton, signed-in, no-photos, price-gated, broker-unavailable, saved).

The whole thing is trust-first: verification badges, a "Why trust this listing?" checklist, and data-confidence labels are first-class, not decoration.

---

## 1. File map

Load order matters — each file depends on globals set by the previous one.

| File | Role | Exports (on `window`) |
|---|---|---|
| `listing.html` | HTML shell. Links `styles.css`, loads React/Babel + `_ds_bundle.js`, then the three files below. Mounts `<UPTListing kind="apartment" state="default" />` into `#root`. | — |
| `listing-data.js` | **Data + logic layer.** Sample listings, price formatting, and the type-adaptive spec builder. Plain IIFE, no React. | `UPT_LISTINGS`, `UPT_buildSpecs`, `UPT_topFacts`, `UPT_fmtPrice`, `UPT_perSqft` |
| `ListingActions.jsx` | **Interactive right-column widgets** + gallery: photo carousel, viewing-request booking flow, contact-broker flow, save button, area-trends CTA, mobile bottom bar. | `UPT_Gallery`, `UPT_ActionPanel`, `UPT_MobileBar`, `UPT_AreaTrends`, `UPT_PanelCard`, `UPT_Placeholder` |
| `ListingDetail.jsx` | **Page composition + left-column content sections.** Header, breadcrumb, summary, details, description, area market, location/essentials, transparency, similar, skeleton, and the top-level `UPTListing` page component. | `UPTListing` |

> The `UPT_` prefix ("Udupi Property Tracker") is the mock's working name. In production, rename to your listing namespace; the structure is what matters.

Design-system components come from the compiled bundle: `const { Button, Icon, Badge } = window.ReTrendsDesignSystem_f37966`.

---

## 2. Component tree

```
UPTListing (ListingDetail.jsx)            ← page shell; owns `saved` state, reads kind+state
├─ Header                                  sticky top nav (logo, Discover/Trends/Saved, sign-in/avatar)
├─ main
│  ├─ "Back to search results" link
│  ├─ Breadcrumb                           Home › Discover › city › area › title
│  └─ two-column grid (.upt-grid)
│     ├─ LEFT column (flex, gap 20)
│     │  ├─ Gallery            (ListingActions.jsx)  hero photo + thumbs + save/share + trust badges
│     │  ├─ Summary                         badges, serif H1 title, ref, top-facts, location, price block
│     │  ├─ Details                         type-adaptive spec Tiles + detail Rows  ← buildSpecs()
│     │  ├─ Description                      free text, empty-state fallback
│     │  ├─ Location                        map placeholder + nearby schools (expandable) + essentials
│     │  └─ Transparency                    trust checklist (per tier) + metadata footer
│     └─ RIGHT column
│        └─ ActionPanel        (ListingActions.jsx)  sticky sidebar
│           ├─ PanelCard
│           │  ├─ Booking                    quick-date chips + 14-day mini-calendar + time slots + submit
│           │  ├─ Contact                    expandable message form
│           │  └─ Save button
│           └─ AreaTrends                    navy CTA card → /trends/:city/areas/:area
└─ MobileBar   (ListingActions.jsx)         fixed bottom bar, shown < 720px only
```

`Similar` ("More homes in {area}") and `MockNotes` exist in `ListingDetail.jsx` but are **not** rendered by `UPTListing` in the current mock — `MockNotes` is design-review documentation only; `Similar` is ready to slot back into the left column if wanted.

---

## 3. Data model (`listing-data.js`)

### Listing schema
Every listing extends a shared `COMMON` object (city/area, address, mapsUrl, updated/posted dates, shared `schools` + `essentials`, `photos`) and adds type-specific fields. Key fields:

- **Identity/commercial:** `kind`, `kindLabel`, `ref`, `title`, `price` (integer ₹, or `null` for price-on-request), `listingType` (`sale`|`rent`), `listedBy` (`owner`|`broker`), `trustTier` (`verified`|`trusted`|`listed`).
- **Residential** (apartment/house/villa): `bedrooms`, `bathrooms`, `builtUp` (sq ft int), `furnishing`, `parking`, `floor`/`floors`, `age`, `facing`, `availability`.
- **Plot:** `plotArea`, `dimensions`, `roadAccess`, `boundary`, `title_status`, `buildSuitability`, `facing`, `cornerPlot`, `availability`.
- **Commercial:** `builtUp`, `floors`, `frontage`, `parking`, `usage`, `visibility`, `powerBackup`, `lift`, `availability`.
- **Area market:** `areaMarket` = `{ median, trend, trendDir: "up"|"down", listings, demand, confidence }` **or `null`** (drives the "not enough data yet" empty state).

### The three helper functions — port these exactly
- `fmtPrice(v)` → `null` if no price; `≥1 crore` → `"₹X crore"`, else `"₹X lakh"`. Indian units, not millions.
- `perSqft(p)` → `"₹N / sq ft"` from `price / builtUp`, or `null`.
- `topFacts(p)` → the compact dotted fact line under the title, **type-aware** (BHK/bath/sqft/furnishing for residential; area/dims/road/facing for plot; sqft/floors/usage/frontage for commercial).
- `buildSpecs(p)` → **the heart of the adaptation.** Returns `{ tiles, rows }`:
  - `tiles` = the 4 big headline spec cards; `rows` = the two-column key/value list below.
  - A `tile(icon, label, value)` helper returns `null` when the value is empty, and `clean()` filters nulls — so **fields that don't apply to a type are never emitted**, rather than shown blank. This is the core principle: *hide, don't empty.*
  - Branches on `p.kind`: `plot` → area/dimensions/road/suitability; `commercial` → built-up/floors/frontage/visibility; else residential → bedrooms/bathrooms/built-up/floor(s).

**Production note:** replace `UPT_LISTINGS` with an API fetch returning the same shape. Keep `buildSpecs`/`topFacts`/`fmtPrice`/`perSqft` as pure view helpers — they contain the domain rules for how each property type is presented.

---

## 4. State model (`UPTListing`)

Two props drive everything:
- `kind` — which listing to show (`UPT_LISTINGS[kind]`).
- `state` — one string switch selecting a UI scenario:

| `state` | Effect |
|---|---|
| `default` | normal render |
| `loading` | renders `<Skeleton>` instead of content (shimmer placeholders) |
| `signedin` | `Header` shows avatar; `ActionPanel` shows "Signed in as…" and skips contact fields |
| `nophotos` | `Gallery` shows the empty "No photos yet" state |
| `gated` | `Summary` shows "Price on request" + Request-price button |
| `nobroker` | `Booking` shows "Viewing requests aren't open yet"; `Contact` copy shifts to "Ask about this listing" |
| `saved` | `saved` starts true (filled heart) |

The only mutable state at the page level is `saved` (a `useState` synced to the `state` prop via `useEffect`). Everything else is derived from `kind`/`state`. Local interactive state lives inside the widgets (`Booking`, `Contact`, `Gallery`, `Location`).

In production these map to: `kind` from the route/record; `state` from real auth + data conditions (loading query, `session.user`, `listing.photos.length`, `listing.price == null`, `listing.broker == null`, and whether the listing id is in the user's saved set).

---

## 5. The interactive widgets (`ListingActions.jsx`)

### Gallery
Carousel over `p.photos`. `useState(i)` index; `go(±1)` wraps modulo length. Overlays: trust badge + "Updated" badge (top-left), share + save glass buttons (top-right), prev/next arrows + `i+1 / n` counter (when >1 photo). Thumbnail strip below with active outline. `noPhotos` → dedicated empty state. Photos here are striped `Placeholder`s (mock); production swaps in real `<img object-fit:cover>` inside the same rounded frame with the same overlays.

### Booking (the most complex flow)
Request a **viewing time** — explicitly a *request*, not a confirmed booking.
- `TODAY` is hardcoded to `2026-06-23` for the mock; use real `new Date()` in prod.
- 5 quick-date chips (Today, Tom, then weekday abbreviations) + a "Choose another date" toggle revealing a 14-day `MiniCalendar` (`WINDOW = 14`). Dates outside `[TODAY, TODAY+13]` are disabled.
- `slotsFor(date)` returns preferred time slots that vary by weekday (Sun fewer, Sat more, weekday standard). Picking a new date resets the chosen slot.
- Anonymous users must enter name + contact before submit (signed-in users skip this). `canSubmit` = date + slot + contact-ready + idle.
- Submit → `loading` (spinner) → `sent` (success `Notice` with "request another time"). All timeouts are mock stand-ins for an API call.

### Contact
Collapsed → outline button ("Contact broker" / "Ask about this listing" depending on `brokerAvailable`) with a trust note. Expanded → message form (name/contact for anon + textarea prefilled with a polite enquiry) → `loading` → `sent` `Notice`. No phone numbers shared until both parties agree (copy reflects this).

### ActionPanel
Sticky (`top: 84px`) wrapper composing Booking + divider + Contact + Save button inside a `PanelCard`, with the `AreaTrends` navy CTA card beneath. Save button toggles `variant` (`secondary` when saved, `ghost` otherwise) and heart color.

### MobileBar
`position: fixed` bottom bar, `display:none` by default, flipped to `flex` under 720px via the media query in `listing.html`. Save + Contact + Request-viewing.

### Shared bits
`Placeholder` (striped image stand-in), `GlassBtn` (frosted round control), `Spinner`, `Notice` (positive/negative status block), `PanelCard`, `Field` (styled input). Reuse or replace with your form primitives.

---

## 6. Content sections (`ListingDetail.jsx`)

- **Header** — sticky, blurred translucent white, `borderBottom` hairline. Logo lockup + centered pill nav (active pill = navy fill) + sign-in/avatar.
- **Breadcrumb** — Home › Discover › city › area, then the title in strong text.
- **Section** — the reusable card scaffold every content block uses: white paper card, hairline border, `--radius-xl`, `--shadow-sm`, `26px` padding, an icon+title header with optional `sub` and right-aligned `action`.
- **Summary** — badges (kind / for-sale-or-rent / listed-by), serif H1 `title`, mono `ref`, dotted `topFacts` line, location + Google Maps link on the left; the price block on the right (`fmtPrice` + `perSqft`, or the price-gated variant).
- **Details** — `buildSpecs(p)` → grid of big `Tile`s + two-column detail `Row`s. Grid columns = `tiles.length`.
- **Description** — free text (max 70ch, `text-wrap:pretty`) or an empty-state nudge.
- **AreaMarket** — 4 `MarketStat`s (median / 12-mo trend with ▲▼ color / listings / demand) + a caution confidence strip **when `p.areaMarket` exists**, otherwise the "not enough data yet" empty state. Links to the area trends route.
- **Location** — striped map placeholder (swap for a real map), nearby schools (first 4, "show all" expander) in a two-col list, and nearby essentials cards (first 2, expander).
- **Transparency** — `TRUST_CHECKS[trustTier]` checklist (green check vs caution triangle for pending items) + metadata footer (updated / listed-by / posted) + report link. This is the brand-defining trust section.

---

## 7. Design-system dependencies

Load `_ds_bundle.js` and read from `window.ReTrendsDesignSystem_f37966`. Components used here:

- **`Button`** — `variant`: `primary｜accent｜secondary｜outline｜ghost｜link`; `size`: `sm｜md｜lg｜icon`; `fullWidth`. `accent` (copper) is reserved for the single most important CTA (here: "Request viewing time").
- **`Badge`** — `tone`: `neutral｜navy｜accent｜verified｜trusted｜positive｜caution｜negative`; `solid`; `pill`. Trust tiers map to `verified`/`trusted`.
- **`Icon`** — Lucide subset renderer: `name`, `size`, `color`, `strokeWidth`. Names used: map-pin, trending-up, shield-check, shield, file-check, bed, bath, maximize, calendar, heart, star, arrow-right, arrow-up-right, chevron-down, chevron-right, check, x, sliders-horizontal, building, camera, eye, layers, route, users, message-circle, alert-triangle. **In production use `lucide-react` directly** — any Lucide icon is on-brand.

All spacing, color, radius, shadow, and type values are **CSS custom properties** from `styles.css` (137 tokens). Never hardcode hex — use `var(--navy-800)`, `var(--accent)`, `var(--border)`, `var(--radius-xl)`, `var(--shadow-sm)`, `var(--font-serif｜sans｜mono)`, `var(--text-strong｜body｜muted)`, etc. Numbers/prices/areas/percentages always use `var(--font-mono)` (Geist Mono); the H1 title uses `var(--font-serif)` (Fraunces); everything else is `var(--font-sans)` (Plus Jakarta Sans).

---

## 8. Responsive behavior

Three breakpoints, defined as `!important` overrides in `listing.html`:
- **≤1000px** — grid collapses to one column; sticky sidebar becomes static (`ActionPanel` flows below content).
- **≤720px** — tighter main padding with bottom room for the mobile bar; top `nav` hidden; spec tiles → 2-col; detail rows / schools / essentials / trust / similar → 1-col; `MobileBar` shown.

In production, prefer Tailwind responsive utilities over the `!important` media block; the breakpoints and collapse logic are what to preserve.

---

## 9. Porting checklist (React + Vite + Tailwind + shadcn)

1. **Data:** replace `UPT_LISTINGS` with an API/loader returning the same listing shape. Keep `buildSpecs` / `topFacts` / `fmtPrice` / `perSqft` as pure functions (unit-test them — they encode the Indian-currency + type-adaptation rules).
2. **States:** derive the `state` union from real conditions (query loading, session, photos length, price null, broker null, saved set) rather than a single prop.
3. **Components:** map inline-styled mock widgets to your shadcn/Tailwind primitives, but keep the **structure** (two-column sticky layout, Section scaffold, the trust checklist, the request-not-booking booking flow, the hide-don't-empty spec rendering).
4. **Tokens:** wire the ReTrends CSS variables (or their Tailwind theme equivalents from the source `theme.css`) — do not reintroduce generic Tailwind blue/green. Copper accent stays reserved for one CTA per view.
5. **Icons:** `lucide-react`.
6. **Booking calendar:** replace hardcoded `TODAY` with `new Date()`; back the submit + slot availability with real endpoints; keep the "this is a request, the lister confirms" framing.
7. **Map & photos:** swap the striped placeholders for a real map embed and `<img>` galleries; keep the frosted trust caption + badge overlays.
8. **Copy:** sentence case everywhere; trust-led, plain, reassuring; ₹ Cr/Lakh; no emoji (see `readme.md` §Content fundamentals).

---

## 10. Where to look while implementing

- Full component/token reference and brand rules: `readme.md` (project root).
- Live mock to inspect states: open `listing.html` and edit the final `render(<UPTListing kind="…" state="…" />)` call — try each `kind` and `state` combination.
- Component prop docs: `components/**/*.d.ts` and `*.prompt.md`.
- Sibling Discover journeys (map discovery, area-first) live in the same folder if you need surrounding context.
