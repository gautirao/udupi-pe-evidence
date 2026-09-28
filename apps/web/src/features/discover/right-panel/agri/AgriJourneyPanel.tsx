import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PanelHeader } from '@/components/discover/PanelHeader';
import { AgriGroupSelectedPanel } from '@/components/discover/panels/AgriGroupSelectedPanel';
import { AgriGroupListingPeek } from '@/components/discover/panels/AgriGroupListingPeek';
import { AgriGroupLocalityPanel } from '@/components/discover/panels/AgriGroupLocalityPanel';
import { AgriListingPanel } from '@/components/discover/panels/AgriListingPanel';
import { useAgriDestinations } from '@/hooks/useRegionalAreaGroups';
import { resolveAgriCorridorLookup } from '@/features/discover/selectors/agriPanelLookups';
import { CorridorLandingPanel, BEARING_LABELS } from '@/features/discover/right-panel/agri/CorridorLandingPanel';
import { AgriSelectedAreaPanel } from '@/features/discover/right-panel/agri/AgriSelectedAreaPanel';
// Issue #2657 R2 — this file only needs the panelContent union; indexed off
// the authoritative type, never off DiscoverRightPanel's own props.
import type { DiscoverPanelContent } from '@/utils/discoverPanelState';
import type {
  AgriJourneyView,
  AgriJourneyCommands,
  SharedContextView,
  SharedAreaView,
  SharedCardsView,
  SharedChromeCommands,
} from '@/features/discover/right-panel/contracts';

/** The 6 panelContent values this component owns (architect plan §2). */
export type AgriJourneyPanelContent = Extract<
  DiscoverPanelContent,
  | 'agri-landing'
  | 'agri-selected'
  | 'agri-group-peek'
  | 'agri-group-locality'
  | 'agri-group-selected'
  | 'agri-detail'
>;

export interface AgriJourneyPanelProps {
  panelContent: AgriJourneyPanelContent;
  view: AgriJourneyView;
  commands: AgriJourneyCommands;
  /** Narrow shared slices — never the whole `shared` object (issue #2657 DoD). */
  context: Pick<SharedContextView, 'city' | 'cityLabel' | 'intent' | 'isAuthenticated'>;
  area: Pick<SharedAreaView, 'point'>;
  selectedListingId: SharedCardsView['selectedListingId'];
  onStartOver: SharedChromeCommands['startOver'];
}

/**
 * Issue #2657 C4 — owns every agri-first panel-content state (moved verbatim
 * from DiscoverRightPanel's `renderPanel` switch). Also owns `useAgriDestinations`
 * (moved verbatim, same arguments/enabled-gate/cache-key as before — see this
 * function's own comment below and the C4 report's mount-lifetime note).
 *
 * PANEL_OPEN telemetry stays in DiscoverRightPanel (not moved here).
 */
export function AgriJourneyPanel({
  panelContent,
  view,
  commands,
  context,
  area,
  selectedListingId,
  onStartOver,
}: AgriJourneyPanelProps): React.ReactNode {
  const navigate = useNavigate();

  // Issue #2151 PR C (gap closure) — resolves the human-readable display name
  // for the selected Agri locality's canonical areaKey. Moved verbatim from
  // DiscoverRightPanel (#2657 C4): SAME arguments (city gated to non-empty
  // only for 'agri-group-locality', same selectedRegion/selectedMaxKm/intent
  // sourcing), SAME internal `enabled: city.length > 0` gate inside the hook
  // (unchanged — the hook itself is outside this PR's allowed edit globs),
  // and therefore the SAME TanStack Query cache key. The only difference from
  // before is mount lifetime: this hook now runs only while AgriJourneyPanel
  // is mounted (i.e. panelContent is one of the 6 agri states) instead of on
  // every DiscoverRightPanel render — but with an empty city string the call
  // was already a no-op (query disabled) for every non-agri panelContent
  // before this move, so no fetch fires, and none is skipped, that didn't
  // fire/skip before. See the C4 report for the fuller G14 argument.
  const { destinations: agriDestinationsForLocality } = useAgriDestinations(
    panelContent === 'agri-group-locality' ? (context.city ?? '').trim().toLowerCase() : '',
    view.selection.region,
    view.selection.maxKm,
    context.intent === 'rent' ? 'rent' : 'sale',
  );

  switch (panelContent) {
    case 'agri-landing':
      // Issue #1429 — corridor-first two-level UX.
      // Level 1 (no region selected): show corridor cards (groupName as primary label).
      // Level 2 (region set, no maxKm): show cumulative distance chips for that corridor.
      // The panel never renders raw DIR:BAND codes as primary text.
      return (
        <>
          <PanelHeader title="Agricultural land" journey="agri-first" onStartOver={onStartOver} />
          <CorridorLandingPanel
            corridorGroups={view.corridors.groups ?? []}
            isLoading={view.corridors.loading ?? false}
            isError={view.corridors.error}
            isNotGeneratedForRevision={view.corridors.notGenerated}
            onRetry={commands.corridors.retry ?? (() => {})}
            selectedRegion={view.selection.region ?? null}
            selectedMaxKm={view.selection.maxKm ?? null}
            onSetRegionWithMaxKm={commands.corridors.setRegionWithMaxKm ?? (() => {})}
            onSetMaxKm={commands.corridors.setMaxKm ?? (() => {})}
            onClearRegionAndMaxKm={commands.corridors.clearRegionAndMaxKm ?? (() => {})}
            discoverAreas={view.corridors.discoverAreas}
            onSelectAreaKey={commands.corridors.selectAreaKey}
            cityLabel={context.cityLabel ?? context.city}
          />
        </>
      );

    case 'agri-selected':
      // Issue #1371 — agri-first journey with an area selected.
      return (
        <AgriSelectedAreaPanel
          selectedArea={area.point}
          agriAreasData={view.areaSummary.data}
          isLoadingListings={view.areaSummary.listingsLoading}
          isLoadingAgriAreas={view.areaSummary.loading}
          areaListings={view.areaSummary.listings}
          onStartOver={onStartOver}
          navigate={navigate}
        />
      );

    case 'agri-group-peek':
      // Issue #1430 — Level-2 listing peek within the agri-group context.
      // selectedGroupListingItem provides synchronous first-paint data (no spinner).
      if (!view.peek.item) return null;
      return (
        <AgriGroupListingPeek
          listingId={view.peek.item.id}
          firstPaintData={view.peek.item}
          onClose={commands.peek.close ?? (() => {})}
          onViewDetails={commands.peek.viewDetails ?? (() => {})}
        />
      );

    case 'agri-group-locality': {
      // Issue #1464 — drill-down showing listings for a single locality within
      // the selected agri regional group. selectedLocality is the canonical
      // areas.area_key single source of truth (C-F1).
      const localityListings = (view.groupListings.data ?? []).filter(
        (l) => l.areaKey === view.selection.locality,
      );
      const selectedLocalityDisplayName =
        agriDestinationsForLocality.find((d) => d.areaKey === view.selection.locality)?.displayName
        ?? 'Selected locality';
      return (
        <>
          <PanelHeader title="Agricultural land" journey="agri-first" onStartOver={onStartOver} />
          <AgriGroupLocalityPanel
            localityName={selectedLocalityDisplayName}
            listings={localityListings}
            isLoading={view.groupListings.loading ?? false}
            isError={view.groupListings.error ?? false}
            onRetry={commands.groupListings.retry ?? (() => {})}
            onSelectListing={commands.groupListings.select ?? ((id) => navigate(`/listing/${id}`))}
            onClose={commands.locality.clear ?? (() => {})}
            intent={context.intent}
            isAuthenticated={context.isAuthenticated}
            selectedListingId={selectedListingId}
            cityLabel={context.cityLabel ?? context.city}
            regionLabel={
              view.selection.region ? (BEARING_LABELS[view.selection.region] ?? view.selection.region) : null
            }
          />
        </>
      );
    }

    case 'agri-group-selected': {
      // Issue #1425 — agri-first journey with a regional group selected but no
      // specific areaKey yet. Shows agri map listings for all areas in the group.
      const agriCorridorLookup = resolveAgriCorridorLookup({
        corridorGroups: view.corridors.groups,
        selectedRegion: view.selection.region,
      });
      return (
        <>
          <PanelHeader title="Agricultural land" journey="agri-first" onStartOver={onStartOver} />
          <AgriGroupSelectedPanel
            groupLabel={view.selection.groupLabel ?? 'Agricultural land'}
            listings={view.groupListings.data}
            listingCount={view.groupListings.data?.length ?? 0}
            isLoading={view.groupListings.loading}
            isError={view.groupListings.error}
            onRetry={commands.groupListings.retry ?? (() => {})}
            onClear={commands.groupListings.clearGroup ?? (() => {})}
            // Issue #1430: listing selection opens the URL-driven peek panel (not
            // a full-page navigation). Falls back to navigate for compatibility
            // when the prop is not provided (e.g. older tests).
            onSelectListing={commands.groupListings.select ?? ((id) => navigate(`/listing/${id}`))}
            selectedMaxKm={view.selection.maxKm ?? null}
            availableMaxDistances={agriCorridorLookup.availableMaxDistances}
            onSetMaxKm={commands.corridors.setMaxKm ?? (() => {})}
            onSelectLocality={commands.locality.set}
            isAuthenticated={context.isAuthenticated}
            agriAcresMin={view.filters.values.agriAcresMin}
            agriAcresMax={view.filters.values.agriAcresMax}
            agriPriceMin={view.filters.values.agriPriceMin}
            agriPriceMax={view.filters.values.agriPriceMax}
            onApplyFilters={commands.filters.apply ?? (() => {})}
            onClearFilters={commands.filters.clear ?? (() => {})}
            agriLandCategory={view.filters.values.agriLandCategory}
            agriFarmhouseAvailable={view.filters.values.agriFarmhouseAvailable}
            agriFencingDone={view.filters.values.agriFencingDone}
            agriWaterSource={view.filters.values.agriWaterSource}
            intent={context.intent}
            truncated={view.groupListings.truncated}
            limit={view.groupListings.limit}
            cityLabel={context.cityLabel ?? context.city}
            // Canonical slug for the destination fetch, kept distinct from
            // `cityLabel` above (display-only; must never drive fetch keys).
            citySlug={context.city}
            corridorName={agriCorridorLookup.corridorName}
            directionCode={view.selection.region}
          />
        </>
      );
    }

    case 'agri-detail':
      // Issue #1374 (demoted to peek in #1405) — lightweight peek for a selected agri polygon.
      // selectedMarkerListing carries the marker (id, loc, boundary);
      // AgriListingPanel fetches compact DTO by id from the public endpoint.
      // onNavigate pushes to /listing/:id for full detail (AgriSpecRows + boundary map).
      return view.peek.markerListing?.id ? (
        <AgriListingPanel
          listingId={view.peek.markerListing.id}
          onBack={commands.peek.clearMarkerSelection ?? (() => undefined)}
          onNavigate={() => navigate(`/listing/${view.peek.markerListing?.id}`)}
          intent={context.intent}
        />
      ) : null;

    default: {
      // Exhaustiveness net (R6, mirrors DiscoverRightPanel's own): forces
      // every AgriJourneyPanelContent member to be handled.
      const _exhaustive: never = panelContent;
      return _exhaustive;
    }
  }
}
