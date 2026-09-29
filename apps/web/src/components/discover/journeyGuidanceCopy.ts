import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

export type JourneyDescriptionKey = Extract<DiscoverJourney, 'area-first' | 'school-first' | 'agri-first'>;

/** Single source for the per-journey helper copy, shared by JourneySwitcher's full cards and DiscoverHeaderJourneyTabs so the two copies can never drift apart. `cityLabel` only affects area-first (city-dynamic). */
export function getJourneyDescription(journey: JourneyDescriptionKey, cityLabel: string): string {
  switch (journey) {
    case 'area-first':
      return `Start with the neighbourhood. Explore ${cityLabel} localities. See properties, schools and insights`;
    case 'school-first':
      return 'Pick a school as your anchor and see only the homes within a commute radius';
    case 'agri-first':
      return 'Looking for farmland instead? Search parcels by corridor, direction and distance from town';
  }
}

/**
 * Same text, with the card's "Recommended" badge folded in as a prefix for
 * area-first — the header has no room for a separate badge, so the marker
 * travels as text instead of being dropped.
 */
export function getJourneyAccessibleDescription(journey: JourneyDescriptionKey, cityLabel: string): string {
  const description = getJourneyDescription(journey, cityLabel);
  return journey === 'area-first' ? `Recommended. ${description}` : description;
}
