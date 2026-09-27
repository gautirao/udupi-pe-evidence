/**
 * ZoneCard — moved from SchoolJourneyPanels.tsx (Issue #2661 commit 3).
 *
 * Issue #1485 — ZoneCard for Level-1 school-browse zone cards. Displays group
 * name, Σ schoolCount, Σ listingCount, area count. Counts are derived by
 * joining group.area_keys against discoverAreas (client-side).
 *
 * The `areaNameSummary` prop from the pre-move source was UNREAD by this
 * component (confirmed via grep before deleting — see commit 3 handback) and
 * is dropped here along with its now-dead call-site computation, per Issue
 * #2661 commit 3's explicit cleanup scope. Everything else is verbatim.
 */
import { useMemo } from 'react';
import { ChevronRight, GraduationCap, Home, Layers } from 'lucide-react';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

export interface ZoneCardProps {
  group: AreaGroup;
  memberAreas: DiscoverArea[];
  onClick: () => void;
}

// Chip cap for the "AREAS" row — mirrors formatMemberAreaSummary's default maxShown
// so the "+ n more" count stays consistent with the previous plain-text rendering.
const ZONE_CARD_AREA_CHIPS_MAX = 3;

export function ZoneCard({ group, memberAreas, onClick }: ZoneCardProps) {
  const totalSchools = memberAreas.reduce((sum, a) => sum + a.schoolCount, 0);
  const totalListings = memberAreas.reduce((sum, a) => sum + a.listingCount, 0);
  const areaCount = group.area_keys.length;

  // Visual-parity polish (cycle 3) — individual bordered chip pills per area name
  // (mock parity), replacing the plain comma-separated summary text. Derived
  // directly from memberAreas (already resolved by the caller) — no new fetch,
  // no re-parsing of the formatted summary string.
  const areaChipNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const a of memberAreas) {
      if (a.name && !seen.has(a.name)) {
        seen.add(a.name);
        names.push(a.name);
      }
    }
    return names;
  }, [memberAreas]);
  const shownAreaChips = areaChipNames.slice(0, ZONE_CARD_AREA_CHIPS_MAX);
  const remainingAreaChips = areaChipNames.length - shownAreaChips.length;

  return (
    <button
      type="button"
      data-testid={`school-zone-card-${group.id}`}
      onClick={onClick}
      className="group w-full text-left rounded-xl border border-border bg-card p-4 transition-all hover:border-plum/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${group.name}: ${totalSchools} school${totalSchools === 1 ? '' : 's'}, ${totalListings} listing${totalListings === 1 ? '' : 's'}, ${areaCount} area${areaCount === 1 ? '' : 's'}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-plum-tint text-plum">
          <Layers className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-foreground truncate" data-testid="school-zone-card-name">{group.name}</p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" data-testid="school-zone-card-area-count">
              {areaCount} area{areaCount === 1 ? '' : 's'}
            </span>
          </div>
          {/* One-line description (mock parity) — the zone's own subtitle when present. */}
          {group.subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{group.subtitle}</p>
          )}
          {/* Issue #1659 — member area names, labelled "AREAS" (mock parity), rendered as
              individual bordered chip pills (cycle 3 visual-parity polish) rather than
              plain comma-separated text. Falls back to nothing when unresolved — never
              fabricated. Testid preserved on the chip row container so existing
              containment assertions (name substrings, "+ n more") still hold. */}
          {shownAreaChips.length > 0 && (
            <div className="mt-1.5">
              <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Areas
              </span>
              <span className="mt-1 inline-flex flex-wrap gap-1.5" data-testid="school-zone-card-area-names">
                {shownAreaChips.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {name}
                  </span>
                ))}
                {remainingAreaChips > 0 && (
                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                    + {remainingAreaChips} more
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Two stat bands (mock parity) — plum "schools" band + copper "nearby homes" band,
          each filling half the card width. Testids/wording ("school"/"listing") are kept
          stable for the existing e2e + unit coverage (groupedCardAreaNames, #1485/#1770
          specs); only the visual treatment (inline row → two filled bands) changes. */}
      <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-plum-tint px-3 py-2">
          <GraduationCap className="h-4 w-4 shrink-0 text-plum" aria-hidden="true" />
          <span className="text-xs text-plum" data-testid="school-zone-card-school-count">
            <span className="font-mono text-sm font-semibold tabular-nums">{totalSchools}</span> school{totalSchools === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-copper-tint px-3 py-2" data-testid="school-zone-card-listing-count">
          <Home className="h-4 w-4 shrink-0 text-copper" aria-hidden="true" />
          <span className="text-xs text-copper">
            <span className="font-mono text-sm font-semibold tabular-nums">{totalListings}</span> listing{totalListings === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end border-t border-border/70 pt-3">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground transition-colors group-hover:text-plum">
          Explore zone
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </button>
  );
}
