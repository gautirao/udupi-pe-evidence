import { RoleAwareHeader } from '@/components/layout/AppLayout';
import { usePreviewCityIdentity } from '@/features/discover/state/usePreviewCityIdentity';
import { useDiscoverNav, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { useDiscoverHeaderHostsControls } from '@/features/discover/state/useDiscoverHeaderHostsControls';
import { DiscoverControlBar } from '@/components/discover/DiscoverControlBar';
import {
  DiscoverHeaderJourneyTabs,
  type DiscoverHeaderRegionGuide,
} from '@/components/discover/DiscoverHeaderJourneyTabs';
import { CITY_CONFIG, DEFAULT_CITY } from '@/lib/localityUtils';
import { getTrendsRoute } from '@/lib/navUtils';

/** Public-facing header for the consumer Discover experience; the sole composer of the collapsed desktop header (control bar + journey tabs), delegating to RoleAwareHeader. Also renders inside an admin city-launch preview, where the control bar stays visible but journey tabs/Trends are suppressed until the previewed city resolves. */
export interface PublicHeaderProps {
  /** The region-guide ring/aria-live frame `RightPanelFrame`'s `JourneySwitcher` also consumes; optional for isolated renders. */
  regionGuide?: DiscoverHeaderRegionGuide;
  /** Single computed source from the page composition root; falls back to this component's own hook call when omitted (isolated renders/tests). */
  hostsHeaderControls?: boolean;
  /**
   * Single computed source from the page composition root (useDiscoverPageContext.ts) —
   * whether the header actually RENDERS journey tabs (`hostsHeaderControls` minus an
   * unresolved admin city-launch preview). Falls back to this component's own
   * `hostsControls && !isUnresolvedPreview` computation when omitted (isolated
   * renders/tests), which is the SAME expression the composition root uses — see
   * that hook's doc comment. Threading it (rather than re-deriving it here from
   * `hostsControls`/`isUnresolvedPreview` alone) is what lets `RightPanelFrame` /
   * `DiscoverJourneyPanelShell` read the identical boolean so the header and panel
   * can never transiently disagree about who owns the journey selector.
   */
  headerHostsJourneyTabs?: boolean;
}

export function PublicHeader({ regionGuide, hostsHeaderControls, headerHostsJourneyTabs }: PublicHeaderProps = {}) {
  const { citySlug, isUnresolvedPreview } = usePreviewCityIdentity();
  const nav = useDiscoverNav();
  const { isMobileShell } = useDiscoverShell();
  // Below this width the header has no room for the control bar; the panel renders its own copy instead (see RightPanelFrame/DiscoverJourneyPanelShell).
  const ownHostsControls = useDiscoverHeaderHostsControls(isMobileShell);
  const hostsControls = hostsHeaderControls ?? ownHostsControls;
  const hostsJourneyTabs = headerHostsJourneyTabs ?? (hostsControls && !isUnresolvedPreview);

  const resolvedCity = citySlug ?? nav.city ?? DEFAULT_CITY;
  // Same slug->label lookup MapEmptyGuidance/etc. use — no cityLabel in discover nav context here.
  const resolvedCityLabel = CITY_CONFIG[resolvedCity]?.label ?? resolvedCity;

  // Control bar stays visible even mid-preview-resolution (it was always shown, unconditionally, before this header owned it); only the city-scoped journey tabs/Trends wait for resolution.
  const discoverHeaderExtras = hostsControls ? (
    <>
      <DiscoverControlBar hostsHeaderControls={hostsControls} />
      {hostsJourneyTabs && (
        <DiscoverHeaderJourneyTabs
          currentCity={resolvedCity}
          currentJourney={nav.journey}
          regionGuide={regionGuide}
          cityLabel={resolvedCityLabel}
        />
      )}
    </>
  ) : undefined;

  // Trends isn't a journey/tab; RoleAwareHeader owns its placement (folded into each role's Zone 3 trigger).
  const discoverTrendsHref = hostsJourneyTabs ? getTrendsRoute(resolvedCity) : undefined;

  return (
    <RoleAwareHeader
      selectedCity={citySlug}
      suppressPublicDiscoveryNav={isUnresolvedPreview}
      discoverHeaderExtras={discoverHeaderExtras}
      discoverTrendsHref={discoverTrendsHref}
    />
  );
}


