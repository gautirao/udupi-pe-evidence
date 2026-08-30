import { CITY_CONFIG } from '@/lib/localityUtils';
import { SchoolsNavigationJourneyPanel } from '@/features/discover/views/SchoolsNavigationJourneyPanel';
import { ROOT_NODE_KEY } from '@/features/discover/navigation/types';
import { DiscoverJourneyPanelShell } from './DiscoverJourneyPanelShell';
import type {
  DiscoverPanelSurfaceView,
  DiscoverPanelSurfaceCommands,
} from '../buildPanelSurfaceModel';
import type { DiscoverActionsContextValue } from '@/features/discover/context/types';

/**
 * ISP — only the groups/fields this renderer actually reads, down to the two
 * `actions` members it calls (see AreaFirstJourneyPanel). It reads nothing off
 * `nav`, so it deliberately declares no `pageContext` view group at all.
 */
export interface SchoolFirstJourneyPanelView {
  pageContext: {
    /** Gates the shell's desktop-only DiscoverControlBar mount (Issue #2108). */
    isMobileShell: boolean;
  };
  routing: Pick<DiscoverPanelSurfaceView['routing'], 'city'>;
  geography: Pick<DiscoverPanelSurfaceView['geography'], 'discoverAreas'>;
  navigation: Pick<
    DiscoverPanelSurfaceView['navigation'],
    'areasNavigationJourney' | 'hoveredNavigationNodeKey' | 'focusedClusterMemberAreaKeys'
  >;
  interaction: Pick<DiscoverPanelSurfaceView['interaction'], 'prefersReducedMotion'>;
}

export interface SchoolFirstJourneyPanelCommands {
  pageContext: {
    actions: Pick<
      DiscoverActionsContextValue,
      'selectArea' | 'buildNodeHref' | 'goToNodeAndClearSchoolSelection'
    >;
  };
  geography: Pick<DiscoverPanelSurfaceCommands['geography'], 'handleAreaSelect'>;
  navigation: Pick<
    DiscoverPanelSurfaceCommands['navigation'],
    'onNavigationNodeHoverChange' | 'onClusterFocusChange' | 'selectJourney'
  >;
}

export interface SchoolFirstJourneyPanelProps {
  view: SchoolFirstJourneyPanelView;
  commands: SchoolFirstJourneyPanelCommands;
}

/**
 * Issue #2142 SOLID follow-up (commit 2) — the canonical school-first
 * node-level branch, moved VERBATIM out of `DiscoverPanelSurface.tsx`. The
 * shell/switcher block that used to be duplicated inline here now comes from
 * the shared `DiscoverJourneyPanelShell`.
 */
export function SchoolFirstJourneyPanel({ view, commands }: SchoolFirstJourneyPanelProps) {
  const { city } = view.routing;
  const { discoverAreas } = view.geography;
  const { areasNavigationJourney, hoveredNavigationNodeKey, focusedClusterMemberAreaKeys } =
    view.navigation;
  const { prefersReducedMotion } = view.interaction;
  const { handleAreaSelect } = commands.geography;
  const { onNavigationNodeHoverChange, onClusterFocusChange, selectJourney } = commands.navigation;
  // Issue #2142 SOLID follow-up (commit 2, PLAN REVIEW correction 3) — was a
  // `useDiscoverActions()` call until this commit; same object, now injected.
  const { actions: urlActions } = commands.pageContext;
  const { isMobileShell } = view.pageContext;

  const isSchoolsFirstCityRoot = areasNavigationJourney.node?.nodeKey === ROOT_NODE_KEY;
  const schoolsFirstCityLabel = CITY_CONFIG[city]?.label ?? city;
  return (
    <DiscoverJourneyPanelShell
      testId="discover-schools-journey-panel-shell"
      isMobileShell={isMobileShell}
      compact={!isSchoolsFirstCityRoot}
      activeJourney="school-first"
      onSelectJourney={selectJourney}
      cityLabel={schoolsFirstCityLabel}
      totalProperties={areasNavigationJourney.nodeCount?.listingCount ?? null}
      areasCount={areasNavigationJourney.nodeCount?.matchingAreaCount ?? null}
      prefersReducedMotion={prefersReducedMotion}
    >
      <SchoolsNavigationJourneyPanel
        journey={areasNavigationJourney}
        onSelectAreaKey={(areaKey) => {
          // Same handling as Areas
          const match = discoverAreas.find((a) => a.areaKey === areaKey);
          if (match) {
            handleAreaSelect(match);
          } else {
            // Issue #2216 — journey-preserving canonical write (mirrors #2203/#2211's
            // DiscoverControlBar fix). Reverse-derive nodeKey from the same node tree
            // the controller's own child lookup uses, so this stays symmetric with
            // handleCanonicalNodeSelect's map-side branch.
            const nodeKey = areasNavigationJourney.node?.children.find(
              (c) => c.areaKey === areaKey,
            )?.nodeKey;
            if (nodeKey) {
              urlActions.goToNodeAndClearSchoolSelection(nodeKey);
            }
            // else: fail closed, no-op. This should be structurally
            // unreachable — areaKey originates from the same node tree this
            // lookup searches — but if the reverse lookup ever misses, the
            // click is silently swallowed rather than re-emitting the legacy
            // `areaKey=` write this issue (#2216) exists to eliminate.
          }
        }}
        buildNodeHref={urlActions.buildNodeHref}
        hoveredNodeKey={hoveredNavigationNodeKey}
        onHoverChange={onNavigationNodeHoverChange}
        // Issue #2353 (drift fix) — the canonical city slug, distinct from
        // `cityLabel` below (display-only). See
        // `SchoolsNavigationJourneyPanelProps.city`'s own doc comment.
        city={city}
        cityLabel={schoolsFirstCityLabel}
        focusedClusterMemberAreaKeys={focusedClusterMemberAreaKeys}
        onClusterFocusChange={onClusterFocusChange}
      />
    </DiscoverJourneyPanelShell>
  );
}
