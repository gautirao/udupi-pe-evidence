# Cross-Source Deduplication Report - Issue #2304

Heuristic: same listing_purpose + coordinate within 50m + price within 5%, plus a bedroom check -> treated as the same physical property; the 99acres row is dropped in favour of the already-validated Housing.com row. The bedroom check requires an exact match when either side is a RESIDENTIAL-family listing (99acres commercial/plot rows always carry bedrooms=None by construction, so a null-tolerant check there would let them silently match any nearby similarly-priced residential listing); for a pair where neither side is RESIDENTIAL (e.g. two plots), the bedroom check is skipped entirely.

Cross-source duplicates merged: 0

| 99acres id | Housing.com id | distance(m) | price diff |
|---|---|---|---|
