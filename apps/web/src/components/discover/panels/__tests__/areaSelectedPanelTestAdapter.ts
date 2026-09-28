import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { ReactNode } from 'react';
import type { AreaSelectedPanelCommandsProps, AreaSelectedPanelViewProps } from '../AreaSelectedPanel';

/**
 * Issue #2658 (C5) — the pre-flip flat prop shape, kept ONLY as the shared
 * shape this test-only adapter accepts. Every field/name here is exactly the
 * flat `AreaSelectedPanelProps` interface the panel used to expose; nothing
 * new was invented. Existing test files keep calling their own
 * `renderPanel({ someFlatProp: x })` helper unchanged — only each helper's
 * OWN construction of the final element goes through `toAreaSelectedPanelContract`
 * below instead of a flat spread, so assertion bodies need no rewrite.
 */
export interface AreaSelectedPanelFlatTestProps {
  selectedArea: AreaPoint;
  areaListings?: DiscoverCityListingItem[];
  areaResultSummaryText?: string | null;
  isLoadingListings?: boolean;
  isFetching?: boolean;
  isInitialLoading?: boolean;
  isListingsError?: boolean;
  onRetryListings?: () => void;
  isViewportScope?: boolean;
  isAuthenticated?: boolean;
  onBack?: () => void;
  onStartOver?: () => void;
  journey?: DiscoverJourney | null;
  filters?: PropertyFilters;
  onFiltersChange?: (filters: PropertyFilters) => void;
  intent?: DiscoverIntent;
  isReadyToMoveSupported?: boolean;
  isCommercialSubtypeSupported?: boolean;
  filtersContent?: ReactNode;
  activeContextChips?: ReactNode;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  selectedListingId?: string | null;
  hoveredListingId?: string | null;
  onSelectListing?: (id: string) => void;
  onHoverListing?: (id: string | null) => void;
  trendsHref?: string;
  onSelectJourney?: (journey: DiscoverJourney) => void;
  onAddSchool?: () => void;
  onCityChange?: (city: string) => void;
  onIntentChange?: (intent: DiscoverIntent) => void;
  cityLabel?: string;
  groupName?: string | null;
  regionName?: string | null;
  city?: string;
  onCrumbHome?: () => void;
  onCrumbCity?: () => void;
  onCrumbRegion?: () => void;
  onCrumbGroup?: () => void;
  onRedrawPolygon?: () => void;
}

/**
 * Issue #2658 (C5) — adapts the pre-flip flat test props into the panel's
 * real {view, commands} contract. Every field maps 1:1 onto the same group
 * AreaSelectedPanel.tsx itself destructures from, so this is a pure regroup,
 * not a behavior change.
 */
export function toAreaSelectedPanelContract(flat: AreaSelectedPanelFlatTestProps): {
  view: AreaSelectedPanelViewProps;
  commands: AreaSelectedPanelCommandsProps;
} {
  return {
    view: {
      area: {
        point: flat.selectedArea,
        cityLabel: flat.cityLabel,
        groupName: flat.groupName,
        regionName: flat.regionName,
        city: flat.city,
        journey: flat.journey,
      },
      results: {
        listings: flat.areaListings,
        summaryText: flat.areaResultSummaryText,
        isLoading: flat.isLoadingListings,
        isFetching: flat.isFetching,
        isInitialLoading: flat.isInitialLoading,
        isError: flat.isListingsError,
        isViewportScope: flat.isViewportScope,
      },
      filters: {
        filters: flat.filters,
        intent: flat.intent,
        isReadyToMoveSupported: flat.isReadyToMoveSupported,
        isCommercialSubtypeSupported: flat.isCommercialSubtypeSupported,
        content: flat.filtersContent,
        activeContextChips: flat.activeContextChips,
      },
      search: { query: flat.searchQuery },
      listingCards: {
        isAuthenticated: flat.isAuthenticated,
        selectedListingId: flat.selectedListingId,
        hoveredListingId: flat.hoveredListingId,
      },
      links: { trendsHref: flat.trendsHref },
    },
    commands: {
      navigation: {
        onBack: flat.onBack,
        onStartOver: flat.onStartOver,
        onSelectJourney: flat.onSelectJourney,
        onAddSchool: flat.onAddSchool,
        onCityChange: flat.onCityChange,
        onIntentChange: flat.onIntentChange,
        onCrumbHome: flat.onCrumbHome,
        onCrumbCity: flat.onCrumbCity,
        onCrumbRegion: flat.onCrumbRegion,
        onCrumbGroup: flat.onCrumbGroup,
      },
      filters: { change: flat.onFiltersChange },
      search: { change: flat.onSearchChange },
      listings: {
        select: flat.onSelectListing,
        hover: flat.onHoverListing,
        retry: flat.onRetryListings,
      },
      scope: { redrawPolygon: flat.onRedrawPolygon },
    },
  };
}
