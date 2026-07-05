# Issue #1745 — Unified Discover Portal: 4-Level Hierarchy Final Validation & QA Evidence

This directory contains the automated Playwright QA screenshots verifying the 4-level Discover hierarchy for Bangalore:
`City → Macro Region → Zone/Corridor → Area → Listings`

## Evidence Files

1. **`1_city_landing.png`**: City root view (`/discover?city=bangalore`). Shows North/East/South Bangalore macro-region bubbles on the map with property counts, excluding individual corridors.
2. **`2_macro_region_north.png`**: Macro-region drill-down (`/discover?city=bangalore&scope=north`). Both map and right panel transition in lockstep to display only North Bangalore corridors (Airport Belt, North Growth), excluding East/South/West zones.
3. **`3_area_first_journey.png`**: Area-first guided entry (`/discover?city=bangalore&journey=area-first`). Displays corridors cleanly grouped under their macro-region headers.
4. **`4_zone_corridor_selected.png`**: Corridor selection (`&groupId=airport-belt`). Drills down to member localities (Yelahanka, Hebbal).
5. **`5_area_selected.png`**: Area selection (`&areaKey=IN|KA|Bengaluru|Yelahanka`). Displays area listings with a 4-level breadcrumb (`Home > Bangalore > Airport Belt > Yelahanka`).
6. **`6_breadcrumb_return.png`**: Verification of clean backward navigation via breadcrumb and URL state.

## Automated Verification Rules Enforced
- **Real Loaded State Only:** All captures assert the absence of spinners, skeletons, and `"No areas found"` fallbacks.
- **Cookie Banner Suppressed:** Telemetry consent was pre-granted via localStorage before navigation.
- **Lockstep Map & Panel:** Proved across all 4 drill-down levels.
