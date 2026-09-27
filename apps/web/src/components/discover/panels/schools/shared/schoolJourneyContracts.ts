/**
 * Shared {view,commands} contract types for the 4 public School panels
 * (Issue #2661 commit 5 — {view,commands} contract narrowing).
 *
 * These are the genuinely-shared slices only (chrome/viewer view, listing
 * commands, property-filters view/commands, and the generic query-state
 * wrapper). Panel-specific groupings (e.g. SchoolBrowsePanel's `zones`,
 * SchoolsInAreaPanel's `schools`/`homes`) are typed inline in each panel's
 * own file — they are not reused elsewhere and do not belong here.
 *
 * Field types are derived from the authoritative existing types
 * (`PanelHeaderProps`, `PropertyCardProps`) rather than hand-duplicated, so a
 * change to either source type is caught here at compile time instead of
 * silently drifting.
 */
import type { ReactNode } from 'react';
import type { PanelHeaderProps } from '@/components/discover/PanelHeader';
import type { PropertyCardProps } from '@/components/discover/PropertyCard';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

/** Generic read-state slice for a query-backed value: data + in-flight signals. */
export interface SchoolQueryState<T> {
  data: T;
  loading?: boolean;
  fetching?: boolean;
  error?: boolean;
}

/** PanelHeader-facing view slice — journey pill + context chips. */
export interface SchoolChromeView {
  journey?: PanelHeaderProps['journey'];
  activeContextChips?: PanelHeaderProps['activeContextChips'];
}

/** PanelHeader-facing view slice for panels that also render a filters-sheet trigger. */
export interface SchoolChromeViewWithFilters extends SchoolChromeView {
  filtersContent?: ReactNode;
}

/** PanelHeader-facing command slice — both optional, mirroring PanelHeaderProps itself. */
export interface SchoolChromeCommands {
  startOver?: PanelHeaderProps['onStartOver'];
  back?: PanelHeaderProps['onBack'];
}

/** Buy/Rent intent + auth-state view slice shared by every school-journey results panel. */
export interface SchoolViewerView {
  intent?: DiscoverIntent;
  isAuthenticated?: boolean;
}

/** Card selection/hover commands — same shape PropertyCard itself exposes. */
export interface SchoolListingsCommands {
  select?: PropertyCardProps['onSelect'];
  hover?: PropertyCardProps['onHover'];
}

/** Current committed property-filters value, read by the "clear filters" empty-state action. */
export interface SchoolPropertyFiltersView {
  value?: PropertyFilters;
}

/** Replaces the committed property-filters value (e.g. the empty-state "Clear filters" CTA). */
export interface SchoolPropertyFiltersCommands {
  replace?: (filters: PropertyFilters) => void;
}
