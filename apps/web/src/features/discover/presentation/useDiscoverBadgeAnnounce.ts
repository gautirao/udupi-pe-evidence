import { useEffect, useRef, useState } from 'react';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import { formatDiscoverBadgeCopy, type DiscoverBadgeResult } from '@/features/discover/presentation/discoverBadge';
import { CITY_CONFIG } from '@/lib/localityUtils';

export interface UseDiscoverBadgeAnnounceParams {
  discoverBadge: DiscoverBadgeResult;
  selectedArea: AreaPoint | null;
  focusedGroup: AreaGroup | null;
  city: string;
  urlStateQ: string | undefined;
}

/**
 * Issue #1824 Slice S10a — debounced, polite result-count announcement (AC11),
 * lifted verbatim out of MapDiscovery.tsx L1265-1285. See
 * docs/audit/evidence/issue-1824-map-discovery-decomposition/slice-s10a-implementation.md.
 *
 * A visually-hidden mirror of the badge copy, updated ~500ms after the badge
 * SETTLES (not while loading), so screen-reader users hear one announcement
 * per fetch settle — never per keystroke, never mid-refetch. Uses the same
 * shared copy contract as the generic map-badge branch (formatDiscoverBadgeCopy)
 * for an honest, if not always verbatim, summary of every scope.
 *
 * Behaviour-preserving lift-and-shift — the only change from the original is
 * `urlState.q` → the injected `urlStateQ` param (same value, same identity
 * semantics). Do NOT change the guard, the debounce, the scopeLabel ladder,
 * the noun branch, the cleanup, or the dep array.
 */
export function useDiscoverBadgeAnnounce({
  discoverBadge,
  selectedArea,
  focusedGroup,
  city,
  urlStateQ,
}: UseDiscoverBadgeAnnounceParams): string {
  const [announcedBadgeText, setAnnouncedBadgeText] = useState('');
  const badgeAnnounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (discoverBadge.loading) return; // never announce mid-refetch
    if (badgeAnnounceTimer.current) clearTimeout(badgeAnnounceTimer.current);
    badgeAnnounceTimer.current = setTimeout(() => {
      const text = !discoverBadge.visible
        ? ''
        : formatDiscoverBadgeCopy(discoverBadge, {
            scopeLabel:
              selectedArea?.areaLabel ?? focusedGroup?.name ?? (CITY_CONFIG[city]?.label ?? city),
            noun: selectedArea ? 'homes' : 'properties',
            searchQuery: urlStateQ,
          });
      setAnnouncedBadgeText(text);
    }, 500);
    return () => {
      if (badgeAnnounceTimer.current) clearTimeout(badgeAnnounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverBadge, selectedArea, focusedGroup, city, urlStateQ]);

  return announcedBadgeText;
}
