# ReTrends Design System

> A premium, data-led **real-estate discovery & intelligence platform** for India — discover verified listings on a map, read real market trends by locality, and decide with trust & clarity.

This design system encodes the ReTrends brand: foundations (color, type, spacing, elevation), reusable React components, foundation specimen cards, and a full interactive portal UI kit.

## Sources

This system was reverse-engineered from the ReTrends product:

- **GitHub:** `gautirao/Retrendsdesign` (private) — React + Vite + Tailwind v4 + shadcn/ui codebase. Canonical brand tokens live in `src/styles/theme.css`; product surfaces in `src/app/components/pages/`.
- **Figma:** `https://www.figma.com/design/fzxzotGVfdERxvooLXt41f/ReTrends` (referenced by the repo; not directly accessed here).

If you have access, explore the repo and Figma to build higher-fidelity work — especially the Discover map journeys (`MapDiscoveryPage.tsx`) and broker tooling, which this system summarises but does not fully reproduce.

> **Brand direction:** this system uses a premium, Pan-India palette — deep **ink-navy** primary, **off-white** canvas, slate/charcoal text, and a **restrained copper** accent used sparingly. It deliberately moves away from generic Tailwind blue/green and from any local/coastal/rustic styling, toward a business-grade look credible for buyers, investors and brokers nationwide. The source repo's `theme.css` was the starting point; these tokens are the refined source of truth.

---

## Product context

ReTrends is a **trust-first property portal** for the Indian market. Its three differentiators:

1. **Map-first discovery** — browse by locality on an interactive map, compare areas.
2. **Trust signals** — every listing carries a tier (Verified / Trusted / Listed) reflecting document, RERA, and broker checks.
3. **Market insights** — locality price trends, demand gaps, and data-confidence tiers (Full / Limited / Fallback data).

Audiences: **buyers, investors, and brokers** across India — a consumer discovery portal plus broker tooling (dashboard, listing-quality, demand-gaps). Coverage is **Pan-India**, spanning metros and emerging markets (NCR, Mumbai, Bengaluru, Hyderabad, Pune, and beyond). Prices in ₹ Cr/Lakh; RERA registration is a core trust concept.

---

## Content fundamentals

How ReTrends writes:

- **Voice:** confident, plain, reassuring. It positions itself against "another listings portal" — the promise is *clarity and trust*, not volume.
- **Person:** speaks to **"you"** ("Find your home", "Data you can trust", "What we checked for you"). Refers to itself as "we".
- **Tone:** professional and credible — business-grade, for buyers, investors and brokers alike. Helpful, never hypey. Verification language is concrete ("RERA registered", "documents verified, broker checked") rather than vague ("premium", "luxury").
- **Casing:** **Sentence case** everywhere — headlines, buttons, nav ("Explore on map", "View all trends", "Add listing"). Reserve Title Case only for proper nouns and place names.
- **Numbers:** Indian formatting — `₹1.42 Cr`, `₹8,750/sq.ft`, `1,450 sq.ft`, `3 BHK`. Always digits, always mono. Trends shown with direction: `▲ 12.4%`, `-2.1%`.
- **Microcopy patterns:** trust-led ("Verified property", "RERA registered"), data-confidence labels ("Full data" / "Limited data" / "Fallback data"), and gentle urgency ("New", "2 with price drops") — never countdown-timer pressure.
- **Emoji:** none. Meaning is carried by **Lucide icons**, not emoji.
- **Examples:** *"Find your home with trust & clarity."* · *"Not another listings portal — a decision tool built on verified data."* · *"All documents checked, RERA registered, ready to view."*

---

## Visual foundations

- **Palette:** deep **ink-navy** `#1B2A45` (primary), restrained **copper** `#B05C3A` (accent — used *sparingly* for CTAs, selected states, alerts, highlights and insight signals), **off-white canvas** `#F6F5F2` (app background), white paper for cards. Slate/charcoal greys for text and hairline borders. Semantic hues are muted and professional: evergreen = verified/positive, ink-navy = trusted, ochre = caution/limited-data, brick = destructive/negative. **No generic Tailwind blue/green, no neon.**
- **Type:** **Fraunces** (serif) for editorial display — hero headlines, section titles, big statements. **Plus Jakarta Sans** for all UI and body. **Geist Mono** for *all* numbers — prices, areas, percentages, metrics. Display headlines run tight (`-0.02em`), sentence case.
- **Backgrounds:** flat warm off-white; occasional soft top-to-bottom off-white gradient on heroes. Ink-navy is used as a full-bleed band for CTAs and area headers. **No** busy gradients, no purple-blue meshes, no textures.
- **Imagery:** clean, modern real-estate photography (homes, skylines, localities), neutral and bright, `object-fit: cover` in rounded frames. Overlaid with a bottom-up dark protection gradient + a frosted glass (`backdrop-blur`) trust caption.
- **Cards:** white, `--radius-lg` (12px) corners, hairline `--border` (≈9% navy), soft `--shadow-sm`. Interactive cards lift `translateY(-2px)` to `--shadow-lg` on hover. This lift + shadow is the dominant interaction motif.
- **Borders & radii:** controls 8px, cards 12px, hero/feature 16–24px, pills/avatars full. Hairline borders, never heavy rules.
- **Shadows:** soft, low-contrast, warm-neutral — five-step scale from `xs` (rest) to `xl` (modals). Never harsh black drop shadows.
- **Buttons & states:** hover lifts 1px and darkens fill (`primary → navy-700`, `accent → copper-600`); ghost/outline get a grey wash; disabled drops to 50% opacity. Focus shows a 3px navy ring. No scale-down press state. The copper accent is reserved for the single most important CTA per view.
- **Transparency & blur:** reserved for image-overlay captions (frosted glass over photos) and the sign-in dialog scrim — not used decoratively on flat surfaces.
- **Motion:** quick and functional. `120ms` hovers, `200ms` card transitions, `320ms` for chart bars / image zooms. Standard ease `cubic-bezier(0.4,0,0.2,1)`; ease-out for entrances. No bouncy or infinite animations.
- **Trust as a visual system:** the Verified/Trusted/Listed badge is the single most brand-defining element — tinted pill, Lucide shield icon, appears on every listing and is expanded into a checklist on detail pages.

---

## Iconography

- **System:** [Lucide](https://lucide.dev) — the source app uses `lucide-react` throughout. 24px grid, ~2px stroke, round caps and joins, currentColor.
- **In this system:** `components/Icon.jsx` ships a self-contained subset (map-pin, search, trending-up/down, shield-check, shield, file-check, bed, bath, maximize, calendar, heart, star, arrow-right, chevron-down, check, x, sliders-horizontal, building) so components have no runtime dependency. **For production, use `lucide-react` directly** — any Lucide icon is on-brand.
- **Logo:** a clean **text wordmark** — "**Re**Trends" with the "Re" in copper and "Trends" in ink-navy (Plus Jakarta 700, tight `-0.02em`), optionally locked up with a letter-spaced "REAL ESTATE INTELLIGENCE" eyebrow rule. No icon mark. See `assets/logo-wordmark.svg`, `assets/logo-lockup.svg`, and the Brand → Logo card.
- **No emoji, no unicode-glyph icons.** Numbers occasionally use `▲ / ▼` for trend direction inline with mono text.
- **Recurring icons:** `map-pin` (locality/discovery), `shield-check` (verified), `trending-up` (trends), `bed/bath/maximize` (property specs), `heart` (save).

---

## Index / manifest

**Root**
- `styles.css` — global entry point (consumers link this); `@import`s all tokens.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `fonts.css`.
- `assets/` — `logo-wordmark.svg`, `logo-lockup.svg`.
- `SKILL.md` — Agent-Skills-compatible entry for use in Claude Code.

**Foundation cards** (`guidelines/`, shown in the Design System tab)
- Colors: brand palette, neutrals, trust tiers, status & chart series.
- Type: Fraunces display, Plus Jakarta scale, Geist Mono data.
- Spacing: spacing scale, corner radii, elevation.
- Brand: logo.

**Components** (`components/`)
- `Icon` — Lucide subset renderer.
- `core/` — `Button`, `Badge`, `Input`, `Select`, `Card` (+ `CardTitle`, `CardDescription`).
- `domain/` — `TrustBadge`, `PropertyCard`, `StatTile`.

**UI kit** (`ui_kits/discover/`, `ui_kits/agri-discovery`, `ui_kits/broker/`,`ui_kits/buyer`)
- Interactive ReTrends consumer portal — Home, Discover, Trends, Listing detail, Saved. See its own `README.md`.

> Components are consumed via `window.ReTrendsDesignSystem_f37966.<Name>` after loading `_ds_bundle.js`. Each component has a sibling `.d.ts` (props) and `.prompt.md` (usage).
