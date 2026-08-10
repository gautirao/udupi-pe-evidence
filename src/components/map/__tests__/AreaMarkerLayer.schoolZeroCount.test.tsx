import { describe, it, expect, vi } from 'vitest';

const divIconHtmlCalls: string[] = [];

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn((opts: { html: string; className: string }) => {
      divIconHtmlCalls.push(opts.html);
      return { options: opts };
    }),
  },
}));

import { makeSingleAreaChildCard } from '../AreaMarkerLayer';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';

describe('AreaDestinationMarkerLayer zero-school rendering', () => {
  it('renders "0 schools" exactly once and includes listing count for a zero-school child in Schools journey', () => {
    const zeroSchoolChild: AreasNavigationChild = {
      nodeKey: 'a:koramangala',
      nodeType: 'AREA',
      displayLabel: 'Koramangala',
      displayOrder: 1,
      listingCount: 42,
      schoolCount: 0,
      isLeafArea: true,
      matchingAreaCount: null,
      descendantAreaCount: null,
      representativeAreaKeys: [],
      bounds: null,
      bearingDegrees: null,
    };

    const icon = makeSingleAreaChildCard(zeroSchoolChild, false, false, 'schools');
    const html = (icon as any).options.html;

    // Must contain "0 schools" exactly once visually (and it will also be in the aria-label). We can assert it contains >0 schools< once.
    const zeroSchoolsMatches = html.match(/>0 schools</g);
    expect(zeroSchoolsMatches).toHaveLength(1);

    // Must contain the listing count (42 listings) since the zero state preserves useful listing metadata
    expect(html).toContain('42 listings');
  });
});
