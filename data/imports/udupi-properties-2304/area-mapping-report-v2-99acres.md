# 99acres Area Mapping / Exclusion Report - Issue #2304 (source expansion)

## Out-of-scope localities (different city/taluk)

- Karkala: Separate town/taluk ~25km SE of Udupi city; no existing city mapping; also fails coordinate envelope.
- Kundapura: Existing area IN|KA|Udupi|Kundapura belongs to city_slug='kundapur', a different Discover city. Out of scope.
- Belman: ~20km SE of Udupi city, same area as Karkala; no existing city mapping.
- Hiriydaka: No existing area or OSM evidence obtained within Slice 1 effort budget; coordinate falls outside every existing/new area bbox.
- Perdur: ~20km NE of Udupi city (near Kundapura taluk boundary); coordinate falls outside every existing/new area bbox; not modelled as part of city_slug='udupi'.
- Kemmannu: Coastal locality north of Brahmavar, well outside every existing/new area bbox; not investigated for OSM evidence within Slice 1 effort budget.

## Unresolved localities

- Udyavara: Already flagged unresolved in the Housing.com pass (OSM bbox too coarse; coordinates fall outside every existing area bbox).

## Area/type/envelope exclusion detail

- Ambiguous property-type mapping excluded: 11 (Counter({'Other': 5, 'Builder Floor': 3, 'Studio Apartment': 2, 'Hotel/Resorts': 1}))
- Envelope/price exclusions: 15 (Counter({'out_of_envelope': 15}))
- Area unresolved/out-of-scope exclusions: 16
  - C93473250 (Bailur): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - L92637518 (Yermal Thenka): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - J91967264 (Moodubelle): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - V92637192 (Yermal Thenka): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - S90600754 (Belman): out_of_scope: ~20km SE of Udupi city, same area as Karkala; no existing city mapping.
  - Y92314156 (Belman): out_of_scope: ~20km SE of Udupi city, same area as Karkala; no existing city mapping.
  - O91490102 (Sapthagiri Nagar): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - D92580026 (Bailur): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - B92461596 (Shanthi Nagar): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - W91428810 (Hudco Colony): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - D93703514 (Indrali): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - F93358796 (Udyavara): unresolved: Already flagged unresolved in the Housing.com pass (OSM bbox too coarse; coordinates fall outside every existing area bbox).
  - I54454250 (Neelavara,near Yellampalli Bus Stop): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - H92317526 (Shanthi Nagar): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - A80162053 (Hirebettu): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
  - R90632264 (Bailur): unresolved: locality not aliased, no OSM evidence gathered, coordinate outside every area bbox
