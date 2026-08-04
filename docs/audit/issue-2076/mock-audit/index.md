# Mock-capture index — issue #2076 Amendment-1 AC12

Generated 2026-08-04T02:25:01.115Z. 13/13 states captured in the most recent harness run.

This index is built from the JSON metadata files under `metadata/` by `build-index.ts` (a Playwright globalTeardown) — it is not hand-authored. A "NOT CAPTURED THIS RUN" row means the harness was invoked without that state selected (e.g. a single-project run), or that state's capture failed and threw before writing metadata — never a silent omission.

| capture id | manifest state id | A-state(s) | hash | viewport | verification (method=observed) | screenshot |
|---|---|---|---|---|---|---|
| areas-city-default | areas-city-default | A01 | # | desktop (1366x768) | data-design-screen-attribute="areas-city-default"; heading-text="Where do you want to explore?" | captures/areas-city-default.png |
| areas-region-clusters | areas-region-clusters | A03, A05 | #r=north | desktop (1366x768) | data-design-screen-attribute="areas-region-clusters"; heading-text="Inside North Bangalore" | captures/areas-region-clusters.png |
| areas-region-areas | areas-region-areas | A02, A04 | #r=south | desktop (1366x768) | data-design-screen-attribute="areas-region-areas"; heading-text="Areas in South Bangalore" | captures/areas-region-areas.png |
| areas-area-listings | areas-area-listings | A08, A20 | #a=hebbal | desktop (1366x768) | data-design-screen-attribute="areas-area-listings"; heading-text="Properties in Hebbal"; component-visible="visible" | captures/areas-area-listings.png |
| areas-area-listings-rent-variant | areas-area-listings | A09 | #a=hebbal | desktop (1366x768) | data-design-screen-attribute (recorded)="areas-area-listings"; dom-text="8 rentals" | captures/areas-area-listings-rent-variant.png |
| areas-listings-query-active | areas-listings-query-active | A11 | #a=hebbal | desktop (1366x768) | data-design-screen-attribute (recorded)="areas-area-listings"; input-value="3 bhk"; dom-text="3 of 8 · Reset" | captures/areas-listings-query-active.png |
| areas-listings-filters-active | areas-listings-filters-active | A12 | #a=hebbal | desktop (1366x768) | data-design-screen-attribute (recorded)="areas-area-listings"; aria-pressed="true" | captures/areas-listings-filters-active.png |
| areas-listings-empty-results | areas-listings-query-active | A13 | #a=hebbal | desktop (1366x768) | data-design-screen-attribute (recorded)="areas-area-listings"; dom-text="No homes match" | captures/areas-listings-empty-results.png |
| areas-browse-all | areas-browse-all | A14 | #b=1 | desktop (1366x768) | data-design-screen-attribute="areas-browse-all"; heading-text="All homes in Bangalore" | captures/areas-browse-all.png |
| shell-city-switcher-open | shell-city-switcher-open | — | # | desktop (1366x768) | data-design-screen-attribute="areas-city-default"; component-visible="visible" | captures/shell-city-switcher-open.png |
| shell-area-autocomplete-open | shell-area-autocomplete-open | A19 | # | desktop (1366x768) | data-design-screen-attribute="areas-city-default"; component-visible="visible" | captures/shell-area-autocomplete-open.png |
| areas-city-default-mobile | areas-city-default-mobile | A01, A21 | # | mobile (390x844) | data-design-screen-attribute (recorded)="areas-city-default"; heading-text="Where do you want to explore?" | captures/areas-city-default-mobile.png |
| areas-area-listings-mobile | areas-area-listings-mobile | A08, A21, A23 | #a=hebbal | mobile (390x844) | data-design-screen-attribute (recorded)="areas-area-listings"; heading-text="Properties in Hebbal" | captures/areas-area-listings-mobile.png |
