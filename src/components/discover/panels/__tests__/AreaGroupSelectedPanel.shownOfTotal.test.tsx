/**
 * Issue #1798 PR-B — "Showing X of N areas on the map" note.
 *
 * NEW, isolated file (not appended to AreaGroupSelectedPanel.test.tsx) because
 * this worktree has no VITE_SUPABASE_URL env, and AreaGroupSelectedPanel.test.tsx
 * (like AreaGroupsLandingPanel.test.tsx and MapDiscovery.test.tsx) fails at
 * MODULE LOAD with "supabaseUrl is required" — the panel imports ScopedSearch,
 * which imports useSchoolSearch (src/hooks/useSchoolSearch.ts), which imports
 * '@/lib/api', which imports the generated Supabase client
 * (src/integrations/supabase/client.ts) at module top-level. That client calls
 * createClient(SUPABASE_URL, ...) eagerly, so ANY test that transitively
 * imports the real useSchoolSearch module throws before a single test body
 * runs, regardless of the test's own content — a pre-existing project-env
 * gap (documented, not caused by this issue), reproduced below and then
 * routed around by mocking '@/hooks/useSchoolSearch' BEFORE importing the
 * panel, which prevents Vitest from ever evaluating the real module (and
 * therefore the real Supabase client) at all.
 *
 * This file asserts only the shownCount/totalCount note-render contract
 * (AreaGroupSelectedPanel.tsx L327-338): the note renders only when both
 * counts are present AND shown < total, and its copy is wired verbatim from
 * the two counts — never recomputed or fabricated in the panel itself.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { DiscoverArea } from '@/hooks/useDiscoverAreas';

// Must be declared before importing the panel — replaces the real
// useSchoolSearch module (and therefore its transitive Supabase-client import)
// so this file never touches the missing env var.
vi.mock('@/hooks/useSchoolSearch', () => ({
  useSchoolSearch: () => ({ data: [], isLoading: false }),
}));

import { AreaGroupSelectedPanel } from '../AreaGroupSelectedPanel';

const withQueryClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

const GROUP: AreaGroup = {
  id: 'thanisandra-hennur-belt',
  name: 'Thanisandra-Hennur Belt',
  subtitle: null,
  region_label: 'North',
  school_count: 0,
  area_keys: ['a1', 'a2'],
};

const AREAS: DiscoverArea[] = [
  { areaKey: 'a1', name: 'Thanisandra', geoCenterLat: 13.06, geoCenterLon: 77.62, listingCount: 12, schoolCount: 0 },
  { areaKey: 'a2', name: 'Hennur', geoCenterLat: 13.04, geoCenterLon: 77.63, listingCount: 9, schoolCount: 0 },
];

const baseProps = {
  group: GROUP,
  areas: AREAS,
  cityLabel: 'Bangalore',
  onSelectArea: vi.fn(),
};

describe('AreaGroupSelectedPanel — "Showing X of N areas on the map" note (Issue #1798 PR-B)', () => {
  it('renders the note with the exact shown/total counts when shownCount < totalCount', () => {
    withQueryClient(<AreaGroupSelectedPanel {...baseProps} shownCount={11} totalCount={29} />);

    const note = screen.getByTestId('area-marker-shown-of-total-note');
    expect(note).toHaveTextContent('Showing 11 of 29 areas on the map — all 29 are listed below.');
  });

  it('does NOT render the note when shownCount === totalCount (nothing degraded — map already shows every area)', () => {
    withQueryClient(<AreaGroupSelectedPanel {...baseProps} shownCount={29} totalCount={29} />);
    expect(screen.queryByTestId('area-marker-shown-of-total-note')).not.toBeInTheDocument();
  });

  it('does NOT render the note when shownCount is omitted (map degradation not active / not yet computed)', () => {
    withQueryClient(<AreaGroupSelectedPanel {...baseProps} totalCount={29} />);
    expect(screen.queryByTestId('area-marker-shown-of-total-note')).not.toBeInTheDocument();
  });

  it('does NOT render the note when totalCount is omitted', () => {
    withQueryClient(<AreaGroupSelectedPanel {...baseProps} shownCount={11} />);
    expect(screen.queryByTestId('area-marker-shown-of-total-note')).not.toBeInTheDocument();
  });

  it('does NOT render the note when shownCount > totalCount (defensive — never a real bucketing outcome, but must not render nonsense copy)', () => {
    withQueryClient(<AreaGroupSelectedPanel {...baseProps} shownCount={30} totalCount={29} />);
    expect(screen.queryByTestId('area-marker-shown-of-total-note')).not.toBeInTheDocument();
  });

  it('renders the note even when shownCount is 0 (an explicit, non-fabricated zero) as long as it is less than totalCount', () => {
    withQueryClient(<AreaGroupSelectedPanel {...baseProps} shownCount={0} totalCount={29} />);
    const note = screen.getByTestId('area-marker-shown-of-total-note');
    expect(note).toHaveTextContent('Showing 0 of 29 areas on the map — all 29 are listed below.');
  });

  // ── onAreaHover wiring (map-emphasis signal from the locality list) ────────

  it('fires onAreaHover(areaKey) on mouse-enter and onAreaHover(null) on mouse-leave of a locality card', async () => {
    const user = userEvent.setup();
    const onAreaHover = vi.fn();
    withQueryClient(<AreaGroupSelectedPanel {...baseProps} onAreaHover={onAreaHover} />);

    const card = screen.getByTestId('browse-all-area-a1');
    await user.hover(card);
    expect(onAreaHover).toHaveBeenCalledWith('a1');

    await user.unhover(card);
    expect(onAreaHover).toHaveBeenCalledWith(null);
  });

  // ── onSearchQueryChange pass-through to ScopedSearch ────────────────────────

  it('forwards live keystrokes from ScopedSearch to onSearchQueryChange (area-marker search promotion)', async () => {
    const user = userEvent.setup();
    const onSearchQueryChange = vi.fn();
    withQueryClient(
      <AreaGroupSelectedPanel {...baseProps} onSearchQueryChange={onSearchQueryChange} />,
    );

    const input = screen.getByTestId('scoped-search-input');
    await user.type(input, 'Than');

    expect(onSearchQueryChange).toHaveBeenCalledWith('Than');
  });
});
