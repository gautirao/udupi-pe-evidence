# Area Mapping Report - Issue #2304 Slice 1

## Source locality -> canonical area -> count

| Source locality | Canonical area_key | Count |
|---|---|---|
| Brahmagiri | IN|KA|Udupi|Brahmagiri | 6 |
| Santhekatte | IN|KA|Udupi|Santhekatte | 5 |
| Ambalpadi | IN|KA|Udupi|Kunjibettu | 5 |
| Brahmavar | IN|KA|Udupi|Brahmavar | 5 |
| Manipal | IN|KA|Udupi|Manipal | 4 |
| Kunjibettu | IN|KA|Udupi|Kunjibettu | 4 |
| Kinnimulki | IN|KA|Udupi|Kinnimulki | 4 |
| Chitpady | IN|KA|Udupi|Kunjibettu | 3 |
| Hayagriva Nagar | IN|KA|Udupi|Katapadi | 2 |
| Tenkanidyoor | IN|KA|Udupi|Udupi | 2 |
| Padubidri | IN|KA|Udupi|Padubidri | 2 |
| Eshwar Nagar | IN|KA|Udupi|Manipal | 1 |
| Nittur | IN|KA|Udupi|Udupi | 1 |
| Adi-udupi | IN|KA|Udupi|Adi-Udupi | 1 |
| Kuthpady | IN|KA|Udupi|Kuthpady | 1 |
| Maruthi Veethika | IN|KA|Udupi|Katapadi | 1 |
| Ambagilu | IN|KA|Udupi|Ambagilu | 1 |
| Shirva | IN|KA|Udupi|Shirva | 1 |
| Katapady | IN|KA|Udupi|Katapadi | 1 |
| Tenkanidyoor | IN|KA|Udupi|Malpe | 1 |
| Vidyaratna Nagar | IN|KA|Udupi|Manipal | 1 |
| Kapu | IN|KA|Udupi|Kaup | 1 |
| Maruthi Veethika | IN|KA|Udupi|Udupi | 1 |

## New areas added (OSM Nominatim evidence-backed)

- `IN|KA|Udupi|Santhekatte` (Santhekatte): OSM center (13.3876323, 74.7389702), bbox buffer 0.012 deg
- `IN|KA|Udupi|Brahmagiri` (Brahmagiri): OSM center (13.3412188, 74.7407976), bbox buffer 0.015 deg
- `IN|KA|Udupi|Kinnimulki` (Kinnimulki): OSM center (13.3234807, 74.7388074), bbox buffer 0.012 deg
- `IN|KA|Udupi|Kuthpady` (Kuthpady): OSM center (13.3203168, 74.727029), bbox buffer 0.012 deg
- `IN|KA|Udupi|Ambagilu` (Ambagilu): OSM center (13.3710379, 74.7464615), bbox buffer 0.012 deg
- `IN|KA|Udupi|Adi-Udupi` (Adi-Udupi): OSM center (13.3477889, 74.731205), bbox buffer 0.012 deg

## Out-of-scope localities (excluded - different city/taluk)

- Karkala: Separate town/taluk ~25km SE of Udupi city; not modelled as any existing app city; coordinates also fail the Udupi coordinate envelope (lon > 74.95).
- Kundapura: Existing area IN|KA|Udupi|Kundapura already exists but belongs to city_slug='kundapur' (a different Discover city), not city_slug='udupi'. Out of scope for this import.
- Belman: ~20km SE of Udupi city, same general area as Karkala; no existing city mapping.

## Unresolved localities (excluded - insufficient evidence)

- Doddanagudde (1 listing(s)): OSM match (13.3727,74.8287) is ~8km from actual listing coordinate (13.3567,74.7531) - likely a different same-named place.
- Kukkikatte (4 listing(s)): OSM match (13.3896,74.8268) is ~7km from actual listing coordinates (~13.323,74.769) - likely a different same-named place; no reliable evidence.
- Belman (1 listing(s)): coordinate outside every existing area bbox, no OSM match
- Hayagriva Nagar (1 listing(s)): None
- Dasharath Nagar (2 listing(s)): No OSM match found; listing coordinates fall just outside the Manipal bbox (~300-400m) - too close to call reliably without OSM confirmation.
- Bailoor (1 listing(s)): OSM match resolves to Kundapura taluk (~35km north) - name collision.
- Santhosh Nagara (1 listing(s)): OSM match resolves to Hemmady/Kundapura taluk (~30km north) - name collision, not the Udupi-city locality implied by the listing.
- Udyavara (2 listing(s)): OSM match found but its bounding box (~13.20-13.35 lat, 74.69-74.94 lon) is taluk-scale, too coarse to serve as area boundary evidence; the 2 real listing coordinates (13.310-13.318, 74.736) do not fall inside any existing area bbox either.

## Excluded rows by reason

- Builder 'project' rows (multi-unit price/area ranges, not single real listings): 176
- Ambiguous property-type mapping (Duplex/Farm House/Independent Floor/Studio/Penthouse - no clean single-value schema match): 6
- Coordinate validation: 11
- Shared-coordinate cluster (dissimilar building): 0
- Area unresolved/out-of-scope: 13

## Final normalised (importable) count: 54
