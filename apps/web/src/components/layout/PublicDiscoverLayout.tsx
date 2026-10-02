import React from 'react';
import { PublicHeader } from './PublicHeader';
import type { DiscoverHeaderRegionGuide } from '@/components/discover/DiscoverHeaderJourneyTabs';
import type { PublicNavJourney } from '@/lib/navUtils';

export interface PublicDiscoverLayoutProps {
  children: React.ReactNode;
  /** Forwarded to `PublicHeader`'s journey tabs for the region-guide ring/aria-live signal; optional for other callers. */
  regionGuide?: DiscoverHeaderRegionGuide;
  /** Forwarded to `PublicHeader`; single computed source, optional so callers with no Discover shell context still render (header falls back to its own hook). */
  hostsHeaderControls?: boolean;
  /** Forwarded to `PublicHeader`; single computed source, optional so callers with no Discover shell context still render (header falls back to its own computed value). */
  headerHostsJourneyTabs?: boolean;
  onSelectJourney?: (journey: PublicNavJourney) => void;
}

/**
 * Public-facing shell for the consumer Discover experience (Issue #1588).
 *
 * Pairs the {@link PublicHeader} marketing chrome with a flex-column body so the
 * map/panel surface fills the viewport below the header (no `calc(100vh-…)` magic
 * number). Used ONLY by the public `/discover` route; broker/admin/internal pages
 * continue to use {@link AppLayout}.
 */
export function PublicDiscoverLayout({
  children,
  regionGuide,
  hostsHeaderControls,
  headerHostsJourneyTabs,
  onSelectJourney,
}: PublicDiscoverLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-background">
      <PublicHeader
        regionGuide={regionGuide}
        hostsHeaderControls={hostsHeaderControls}
        headerHostsJourneyTabs={headerHostsJourneyTabs}
        onSelectJourney={onSelectJourney}
      />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
