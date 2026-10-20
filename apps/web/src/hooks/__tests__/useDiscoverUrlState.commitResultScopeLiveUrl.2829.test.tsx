import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Worktrees carry no apps/web/.env; the supabase client is created at import
// time via src/lib/api.ts, so stub it. No network is exercised.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } },
}));
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { useDiscoverActions, useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import type { DiscoverUrlActions } from '../useDiscoverUrlState';

/**
 * Issue #2829 F2 — a result-scope commit issued from a DESCENDANT passive effect
 * in the same commit as a URL change must build from the CURRENT URL.
 *
 * DiscoverProvider's stable actions delegate through a ref that the provider
 * refreshes in its own passive effect, which React runs AFTER its descendants'
 * effects. So a descendant effect reacting to a fresh URL (here: the leaf
 * AREA_SET auto-commit shape of useDiscoverNavigationController) still reaches
 * the PREVIOUS render's commitResultScope, whose react-router `prev` is the
 * pre-navigation URL. Before the fix the REPLACE rewrote `node=` back to the
 * direction it had just left (the T26 "re-entry bounces to d:southeast" symptom).
 */

const DIRECTION = 'd:southeast';
const LEAF_NODE = 'a:IN|KA|Bengaluru|RR Nagar';
const LEAF_AREA = 'IN|KA|Bengaluru|RR Nagar';

let latestSearch = '';
let latestActions: DiscoverUrlActions | null = null;

function LocationProbe() {
  latestSearch = useLocation().search;
  return null;
}

function LeafAutoCommit() {
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  latestActions = actions;
  const active = nav.resultScope?.active ?? null;
  React.useEffect(() => {
    if (nav.rawNodeParam === LEAF_NODE && active == null) {
      actions.commitResultScope({ kind: 'AREA_SET', areaKeys: [LEAF_AREA] }, { history: 'replace' });
    }
  }, [nav.rawNodeParam, active, actions]);
  return null;
}

function renderTree(initialUrl: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <DiscoverProvider>
          <LocationProbe />
          <LeafAutoCommit />
        </DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('#2829 F2 — same-commit descendant commitResultScope builds from the current URL', () => {
  it('keeps the just-pushed leaf node= and adds the AREA_SET scope (no bounce to the previous node)', () => {
    renderTree(
      `/discover?city=bangalore&journey=area-first&node=${encodeURIComponent(DIRECTION)}&lat=12.95000&lon=77.52503&zoom=16`,
    );
    expect(new URLSearchParams(latestSearch).get('node')).toBe(DIRECTION);

    act(() => {
      latestActions?.goToNode(LEAF_NODE);
    });

    const params = new URLSearchParams(latestSearch);
    expect(params.get('node')).toBe(LEAF_NODE);
    expect(params.get('rscope')).toBe('areas');
    expect(params.get('rareas')).toBe(LEAF_AREA);
  });
});
