# ReTrends Broker — Area Insights Dashboard

A **broker-only** intelligence page that answers one question for the selected area:
*"What should I list or improve here to get more enquiries?"*

Route: `/broker/areas/:city/:areaKey` (e.g. `/broker/areas/udupi/malpe`). Opens on **Udupi → Malpe** but is fully reusable — switch city and area from the **Choose market** card and every section updates.

Open **`index.html`**.

## Files
| File | Role |
|------|------|
| `index.html` | App shell — broker top bar, city/area state, scroll-to-top on switch |
| `AreaInsights.jsx` | The full page: header, selector, KPIs, insight, demand/supply, listings, actions, area strip, demand-report CTA, confidence note |
| `data.js` | City→area taxonomy, hand-written Malpe record, generator for every other area |

## Reusability
- **Cities:** Udupi, Bengaluru, Mumbai, Gurugram, Hyderabad, Pune.
- **Areas** depend on the selected city (e.g. Udupi → Malpe / Manipal / Brahmavar / Karkala).
- Changing city resets the area to that city's first area; all links (`/broker/listings/new`, `/trends/:city/areas/:area`, `/broker/demand-gaps`), the title, KPIs, insight, tables, listings and actions update with the selection.
- **Malpe** carries the exact reference copy; other areas are generated from a short demand/action summary so the page never looks hardcoded.

## Theme
Built entirely on the approved **Pan-India** tokens — deep ink-navy header, off-white canvas, slate text, **restrained copper** only on the primary CTA, selected pins/accents and the lead insight. Muted evergreen = positive, ochre = caution, brick = issues. No bright orange blocks, no Tailwind blue/green, no charts.

## Scope
This is the **only** broker page in scope. It intentionally does **not** implement the demand-gaps, listing-quality, public area, school, corridor, or map-explorer pages — it only links out to them.
