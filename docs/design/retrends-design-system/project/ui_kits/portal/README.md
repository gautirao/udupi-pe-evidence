# ReTrends Portal — UI Kit

A high-fidelity, interactive recreation of the **ReTrends** consumer web portal, composed entirely from the design system's component primitives (`Button`, `Badge`, `Card`, `Input`, `Select`, `PropertyCard`, `TrustBadge`, `StatTile`, `Icon`).

Open **`index.html`** for the click-through. It loads the compiled `_ds_bundle.js` and wires a small in-page router.

## Screens
| File | Screen | What it shows |
|------|--------|---------------|
| `HomeScreen.jsx` | Home | Serif hero + search, value props, trending localities, navy CTA |
| `DiscoverScreen.jsx` | Discover | Map-first split view — filter chips, listings grid, stylised map with price pins |
| `TrendsScreen.jsx` | Trends / Area overview | Stat tiles, 12-month price chart, demand insights, locality comparison table |
| `ListingScreen.jsx` | Listing detail | Gallery, specs, trust-detail panel, sticky price + verified-broker card |
| `Header.jsx` | Top nav | Sticky header, logo lockup, nav, sign-in |
| `index.html` | App shell | Router, sign-in dialog, saved screen, footer |
| `data.js` | Mock data | Indian properties, localities, area stats, price series |

## Interactions
- Navigate via the header (Discover / Trends / Saved) or any card CTA.
- Discover: toggle filter chips; hover a listing to highlight its map pin (and vice-versa); click a card → listing detail.
- Listing: Save toggle, trust-detail breakdown.
- Sign in (top-right) → unlocks the Saved screen.

## Notes
- The map is a **stylised placeholder** (CSS grid + price pins), not a live map — the source app uses an interactive map we don't reproduce here.
- Property imagery is from Unsplash (same approach as the source project's `ImageWithFallback`). Swap for real assets in production.
- Built on the **canonical ReTrends theme** — premium Pan-India palette: deep ink-navy, off-white canvas, slate text, and a restrained copper accent. Deliberately avoids generic Tailwind blue/green and any coastal/local styling.
