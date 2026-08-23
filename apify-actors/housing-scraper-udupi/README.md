## What does Housing.com Udupi Property Scraper do?

This Actor scrapes real "for sale" property listings from [Housing.com](https://housing.com) search-result pages for Udupi district localities (built for issue #2304, the Udupi listings import). It extracts individual resale listings — not multi-unit builder projects — including price, area, BHK, facing, and genuine GPS coordinates read from the page's own JSON-LD structured data (`geo.latitude`/`geo.longitude`), plus the site's own locality → city → district hierarchy (`containedInPlace`).

## Current status: BLOCKED by Housing.com's WAF (not deployed)

Local testing (`apify run`) with Apify's `RESIDENTIAL` proxy group, both headless and headed Chromium, was consistently blocked by Housing.com's bot-management WAF ("Request Blocked — Our security system detected suspicious activity") on every attempt, across multiple rotated residential exit IPs. A real browser session on a genuine residential/home IP (manual verification) loads the same pages without issue, confirming the block is IP-reputation based (Apify's shared residential pool is already flagged), not a structural/robots.txt issue.

**Confirmed before hitting the block** (via manual browser verification, not fabricated):
- Real, substantial Udupi-district inventory exists: 405+ listings for Manipal alone, spanning many genuine localities (Tenkanidyoor, Santhekatte, Katapady, Udyavara, Badanidiyoor, Doddanagudde, Nittur, Ambalpadi, Eshwar Nagar, Dasharath Nagar, and more).
- `robots.txt` permits crawling `/in/buy/<city>/<locality>-gid/` and `/in/buy/resale/page/*` (only `/in/buy/plots*`, `/in/buy/agent/*`, `/buy-property-by-*`, and a handful of other paths are disallowed — none of which this Actor needs).
- Individual resale listing cards carry a `<script type="application/ld+json">` blob with real `geo.latitude`/`geo.longitude`, `address`, `containedInPlace` locality hierarchy, and photo — no geocoding fallback needed.
- Pagination works via `?page=N` query param (30 cards/page).
- Housing.com's own `/in/rent/udupi/manipal-gid/` URL 404s (no rent inventory indexed for that locality under that URL pattern) — this Actor targets **sale only**; rent coverage for Udupi would need separate investigation.

This is reported back per the Slice 1 plan's explicit escalation instruction rather than pursued further with more aggressive anti-detection techniques.

## How to use Housing.com Udupi Property Scraper (once unblocked)

1. Provide one or more `startUrls` — full `https://housing.com/in/buy/<city-slug>/<locality-slug>-gid/` search-result URLs.
2. Set `maxPagesPerStartUrl` to bound pagination per URL (30 listings/page).
3. Run the Actor. Politeness delays (`minRequestDelaySecs`/`maxRequestDelaySecs`) are applied before every navigation.
4. Read results from the default dataset.

## Input

- `startUrls` (array, required) — full housing.com "buy" search-result URLs.
- `maxPagesPerStartUrl` (integer, default 5) — pagination cap per start URL.
- `maxRequestsPerCrawl` (integer, default 60) — total request cap across all start URLs.
- `minRequestDelaySecs` / `maxRequestDelaySecs` (integers, default 3/7) — politeness delay range before each page load.
- `proxyConfiguration` (object) — defaults to Apify Proxy, `RESIDENTIAL` group (datacenter IPs are blocked outright).

## Output

One dataset item per individual resale listing:

```json
{
  "source": "housing.com",
  "housingListingId": "20653972",
  "listingUrl": "https://housing.com/in/buy/resale/page/20653972-residential-plot-in-tenkanidyoor-for-rs-2500000",
  "title": "Residential Land / Plot in Tenkanidyoor, Udupi",
  "propertyTypeRaw": "Residential Land / Plot",
  "bedrooms": null,
  "priceValue": 25.0,
  "priceUnit": "L",
  "avgPricePerSqft": 1150,
  "areaValue": 2180,
  "areaUnit": "sqft",
  "areaType": "Plot area",
  "facing": "East",
  "possessionStatus": null,
  "localityRaw": "Tenkanidyoor, Udupi",
  "listing_purpose": "sale",
  "geo": { "latitude": "13.365159", "longitude": "74.724928", "address": "Puttur Lakshminagara Road." },
  "containedInPlace": { "name": "Tenkanidyoor", "containedInPlace": { "name": "Udupi", "containedInPlace": { "name": "Udupi District" } } },
  "photo": "https://is1-3.housingcdn.com/...",
  "scrapedAt": "2026-08-23T08:00:00.000Z"
}
```

Downstream normalisation (property-type/`listing_family` classification, coordinate validation, area mapping onto canonical DB areas, price-paise conversion) happens outside this Actor, per issue #2304 Slice 1.

## Data table

| Field | Description |
|---|---|
| `housingListingId` | Numeric ID parsed from the listing URL — used as the dedup key. |
| `geo.latitude` / `geo.longitude` | Real coordinates from the page's JSON-LD, not geocoded. |
| `containedInPlace` | Locality → city → district hierarchy as Housing.com itself resolves it. |
| `priceValue` / `priceUnit` | Raw price and unit (`L` = lakh, `Cr` = crore) — not yet converted to paise. |
| `areaValue` / `areaType` | Built-up or plot area in sq.ft, with which kind is stated on the card. |

## Tips / known limitations

- Only "buy" (sale) SRP URLs are supported; a rent variant would need its own URL-scheme investigation per locality.
- Builder "project" cards (multi-unit-type listings without a single price/area) are intentionally skipped — only individually-priced resale listings are extracted, to avoid inflating listing counts with non-comparable rows.
- This Actor does not fabricate or geocode coordinates — a listing with no JSON-LD `geo` block is pushed with `geo: null` for downstream exclusion, never a guessed location.
