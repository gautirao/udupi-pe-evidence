import { useEffect, useState } from 'react';
import type React from 'react';

/**
 * Issue #1798 PR-B — live (unsubmitted) area-search query typed into a
 * panel's ScopedSearch. Debounced before driving searchMatchKeys so
 * keystrokes never directly trigger a bucketing recompute on every char —
 * purely a marker-promotion signal, never URL/camera state.
 *
 * Issue #1824 Slice S2c — extracted verbatim out of MapDiscovery (2 useState
 * + the 200ms debounce effect only). The areaSearchMatchKeys useMemo that
 * consumes debouncedAreaSearchQuery reads external `discoverAreas` and stays
 * in MapDiscovery. Returns a plain flat object (no ControllerResult, no
 * memo) — setAreaSearchQuery is the native useState setter and is
 * inherently stable.
 */
export function useAreaSearchState(): {
  areaSearchQuery: string;
  debouncedAreaSearchQuery: string;
  setAreaSearchQuery: React.Dispatch<React.SetStateAction<string>>;
} {
  const [areaSearchQuery, setAreaSearchQuery] = useState('');
  const [debouncedAreaSearchQuery, setDebouncedAreaSearchQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAreaSearchQuery(areaSearchQuery), 200);
    return () => clearTimeout(t);
  }, [areaSearchQuery]);

  return { areaSearchQuery, debouncedAreaSearchQuery, setAreaSearchQuery };
}
