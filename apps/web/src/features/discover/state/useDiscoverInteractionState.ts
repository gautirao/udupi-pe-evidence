import { useCallback, useMemo, useState } from 'react';

/** Generic view/commands split for a leaf state controller hook. */
export interface ControllerResult<TView, TCommands> {
  view: TView;
  commands: TCommands;
}

export interface DiscoverInteractionView {
  /**
   * Issue #1547 — ephemeral hover/focus id for card→marker highlight.
   * Lives in component state only — never written to URL. Resets to null on
   * mouseleave/blur and naturally on journey switch (component re-mounts /
   * panel unmounts). School-first intentionally NOT wired (RISK-3: 3-tier
   * desynced markers).
   */
  hoveredListingId: string | null;
  /**
   * Ephemeral hover/focus signal from a panel locality row → map marker
   * emphasis. NOT persisted to URL; resets on mouse-leave/blur. Mirrors
   * hoveredListingId above. Never drives any camera movement (no panner
   * ticks are keyed on this state).
   */
  hoveredAreaKeyForMap: string | null;
  /**
   * Issue #1806 (FIX-5d) — ephemeral highlight signal from a non-splittable
   * area-cluster chip click → the panel's member-area rows. NOT persisted to
   * URL; mirrors hoveredAreaKeyForMap's ephemeral-state pattern above. Never
   * drives any camera movement (the camera intentionally holds still for a
   * non-splittable cluster click).
   */
  highlightedAreaKeys: string[];
}

export interface DiscoverInteractionCommands {
  hoverListing(id: string | null): void;
  hoverArea(key: string | null): void;
  setHighlightedAreas(keys: string[]): void;
  clearHighlightedAreas(): void;
}

/**
 * Leaf controller hook for MapDiscovery's ephemeral hover/emphasis cluster
 * (Issue #1824 Slice S1). None of this state is ever written to the URL;
 * it exists purely to drive transient card↔marker/panel visual emphasis.
 */
export function useDiscoverInteractionState(): ControllerResult<
  DiscoverInteractionView,
  DiscoverInteractionCommands
> {
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null);
  const [hoveredAreaKeyForMap, setHoveredAreaKeyForMap] = useState<string | null>(null);
  const [highlightedAreaKeys, setHighlightedAreaKeys] = useState<string[]>([]);

  const hoverListing = useCallback((id: string | null) => {
    setHoveredListingId(id);
  }, []);

  const hoverArea = useCallback((key: string | null) => {
    setHoveredAreaKeyForMap(key);
  }, []);

  const setHighlightedAreas = useCallback((keys: string[]) => {
    setHighlightedAreaKeys(keys);
  }, []);

  const clearHighlightedAreas = useCallback(() => {
    setHighlightedAreaKeys([]);
  }, []);

  // commands must be a referentially stable OBJECT (not just individually
  // stable functions) — downstream consumers (e.g. MapDiscovery's
  // handleAreaClusterClick) depend on the whole object, and that callback
  // flows into a Leaflet marker-rebuild effect. An unmemoised literal here
  // would churn the object identity on every render and force marker
  // teardown/rebuild on every unrelated re-render.
  const commands = useMemo(
    () => ({ hoverListing, hoverArea, setHighlightedAreas, clearHighlightedAreas }),
    [hoverListing, hoverArea, setHighlightedAreas, clearHighlightedAreas],
  );

  return {
    view: { hoveredListingId, hoveredAreaKeyForMap, highlightedAreaKeys },
    commands,
  };
}
