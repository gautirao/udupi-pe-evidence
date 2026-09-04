import { CityNotSupported } from '@/components/discover/CityNotSupported';
import { DiscoverPageShell } from '@/features/discover/surfaces/DiscoverPageShell';
import { DiscoverMapSurface } from '@/features/discover/surfaces/DiscoverMapSurface';
import { DiscoverPanelSurface } from '@/features/discover/surfaces/DiscoverPanelSurface';
import { DiscoverOverlaySurface } from '@/features/discover/surfaces/DiscoverOverlaySurface';
import { useDiscoverPageComposition } from '@/features/discover/composition/useDiscoverPageComposition';
import { AreaSetDraftProvider } from '@/features/discover/state/AreaSetDraftContext';

/**
 * Issue #2142 — the Discover page as a THIN COMPOSITION ROOT.
 *
 * Every line below is route/context bootstrap, composition, or rendering.
 * There is no state, no effect, no ref, no query, no derivation and no
 * conditional beyond the one route-level gate (unsupported city), because:
 *
 *   - domain decisions live in the capability controllers under
 *     features/discover/controllers/,
 *   - the wiring between them lives in
 *     features/discover/composition/useDiscoverPageComposition.ts,
 *   - presentation shaping lives in the three surface builders.
 *
 * The relevant guards are mechanical, not conventions:
 *   - pages/__tests__/MapDiscovery.architecture.baseline.test.ts asserts this
 *     file holds zero useState/useEffect/useRef and writes window.__debug
 *     zero times.
 *   - features/discover/composition/__tests__/compositionHookScope.guard.test.ts
 *     asserts the composition hook stays composition-only, so shrinking this
 *     file cannot have been achieved by hiding a god-component one level down.
 */
export default function MapDiscovery() {
  const composition = useDiscoverPageComposition();

  if (composition.status === 'unsupported-city') {
    return <CityNotSupported city={composition.city} />;
  }

  const { shell, map, panel, overlays } = composition;

  return (
    // Issue #2017 (owner-directed desktop rework) — AreaSetDraftProvider
    // lives here, the ONE common ancestor of the map surface (AreaSetChips's
    // mobile popover) and the panel surface (AreaSetDraftPanel's desktop
    // in-panel view), so both consume the SAME draft/nearby-candidate
    // instance. Previously scoped inside DiscoverMapSurface.tsx itself
    // (map-tree-only), which was correct while AreaSetChips was the only
    // consumer but left the panel tree with no access at all.
    <AreaSetDraftProvider>
      <DiscoverPageShell
        isMobileShell={shell.isMobileShell}
        mobileMapOpen={shell.mobileMapOpen}
        mobileMapTrigger={
          !shell.mobileMapOpen
            ? { onOpenMap: shell.onOpenMobileMap, triggerRef: shell.mobileMapTriggerRef }
            : undefined
        }
        mapSurface={
          <DiscoverMapSurface
            view={map.view}
            commands={map.commands}
            mapContainerRef={shell.mapContainerRef}
          />
        }
        panelSurface={<DiscoverPanelSurface view={panel.view} commands={panel.commands} />}
        overlaySurface={<DiscoverOverlaySurface view={overlays.view} commands={overlays.commands} />}
      />
    </AreaSetDraftProvider>
  );
}
