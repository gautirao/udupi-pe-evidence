# Schools-in-area — old→new non-regression matrix

Old capability (ui_kits/discover + new_discover schools mode) → where in the interactive experience → status.

| Old capability | New location in experience.html | Status |
|---|---|---|
| Switch into a dedicated Schools mode | The **Schools** journey card in the shell's journey selector, and the "Schools in <area>" action on the area page (both land in `st.sch`) | Preserved |
| Retain the selected area | Subview keeps `node=`/breadcrumb = Hebbal; "Your selected area Hebbal is kept" chip | Preserved |
| "Your area is kept" context | Evergreen kept-area chip in the subview header | Preserved |
| School-name search | `Search school name…` input filters rows + map pins live | Preserved |
| Board filters | All / CBSE / ICSE / State / IB chips (only boards present), plum accent | Preserved |
| Level filters | All / Primary / Secondary / Higher Secondary chips (only levels present) | Preserved |
| Matching school markers on the map | Plum school pins for the filtered set; recompute on filter change | Preserved |
| Map-marker ↔ school-row selection sync | Hover a row highlights its pin and vice-versa (class toggle, no rebuild) | Preserved |
| Explicit View homes action | "View homes" button per school row | Preserved |
| Selected-school state | Compact selected-school summary replaces the browser | Preserved |
| 5 km / 10 km radius presentation | The real `DPRadius` component (3 / 5 / 10 km) with the dashed plum ring on the map | Preserved |
| Return to the selected area / property state | Change school / Clear school / Back to properties in Hebbal | Preserved |
| Distance-sorted homes near school | Homes sorted by haversine distance to the school | Preserved |

## Intentionally superseded
- **Nothing.** The 3 km radius chip, dropped in an earlier pass, is back: the Schools journey uses the existing product's `DPRadius` (3 / 5 / 10 km).
- The area's property grid is no longer rendered *underneath* the school list — see `NONREGRESSION_MATRIX.md` (density rule); "Back to properties in <area>" is one click.

## Scope semantics (area vs school-radius)
- **Schools in Hebbal** = schools *located inside* the canonical area Hebbal. Informational; does not filter or reorder the area's property results.
- **View homes near <school>** = a school-CENTRED radius result state (its own query over all listings within N km of the school). It is labelled as such and never implies every Hebbal home is close to every Hebbal school.

## Confirmation
No previously available Schools capability was removed. Board/Level filters are multi-select (as in the existing product), school-name search works in-area and city-wide, and the nearby-area comparison flow (Preview/Add, draft chips, Compare N listings, union fit, Edit/Clear/Fit all) is unchanged in the Areas journey. See `NONREGRESSION_MATRIX.md` for the full three-journey audit.
