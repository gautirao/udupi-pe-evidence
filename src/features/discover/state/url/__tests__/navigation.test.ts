/**
 * Issue #1956 PR 1 (FE-1) — the `node` / `areasPreview` URL capability domain.
 *
 * Exercised through the useDiscoverUrlState facade (not the domain hook in
 * isolation) because the facade is the contract every caller actually sees, and
 * because AC1.3's "an ordinary interaction never writes areasPreview" is a
 * statement about the OTHER domains' writers, which only the facade composes.
 *
 * Covers:
 *  - `node` read + whitespace/empty normalisation (AC1.4 parse discipline)
 *  - `areasPreview` presence-flag read
 *  - AC1.3 survival across preview navigation
 *  - AC1.3 "never written by an ordinary interaction"
 *  - AC1.3 "never appears in a canonical/share URL" — enforced as the absence of
 *    any writer anywhere in src/ (static sweep), which is the strongest form
 *    available given no writer exists at all in PR 1
 *  - AC1.4 — no Areas-hierarchy identity is derived from groupId/region/areaKey/
 *    scope: `node` is read from `node` alone
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';

function wrapper(initialUrl: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, { initialEntries: [initialUrl] }, children),
    );
  };
}

/** Renders the facade alongside useLocation so URL writes can be inspected. */
function renderFacade(initialUrl: string) {
  return renderHook(
    () => ({ urlState: useDiscoverUrlState(), location: useLocation() }),
    { wrapper: wrapper(initialUrl) },
  );
}

const CANONICAL_NODE = 'a:IN|KA|Bengaluru|Whitefield';

describe('navigation URL domain — `node` read', () => {
  it('reads a canonical node key from the URL', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&node=${encodeURIComponent(CANONICAL_NODE)}`,
    );
    expect(result.current.urlState[0].node).toBe(CANONICAL_NODE);
  });

  it('is null when node is absent', () => {
    const { result } = renderFacade('/discover?city=bangalore');
    expect(result.current.urlState[0].node).toBeNull();
  });

  it('is null when node is empty (?node=)', () => {
    const { result } = renderFacade('/discover?city=bangalore&node=');
    expect(result.current.urlState[0].node).toBeNull();
  });

  it('is null when node is whitespace-only — same discipline as the groupId trim guards', () => {
    const { result } = renderFacade('/discover?city=bangalore&node=%20%20%20');
    expect(result.current.urlState[0].node).toBeNull();
  });

  it('trims surrounding whitespace off an otherwise valid key', () => {
    const { result } = renderFacade(
      `/discover?city=bangalore&node=${encodeURIComponent(`  ${CANONICAL_NODE}  `)}`,
    );
    expect(result.current.urlState[0].node).toBe(CANONICAL_NODE);
  });

  it('AC1.4 — node is derived from `node` alone, never from groupId/areaKey/region/scope', () => {
    const { result } = renderFacade(
      '/discover?city=bangalore&groupId=whitefield-belt&areaKey=IN%7CKA%7CBengaluru%7CWhitefield&region=NW&scope=east',
    );
    const state = result.current.urlState[0];
    // Legacy params are still read by their own canonical domains...
    expect(state.groupId).toBe('whitefield-belt');
    expect(state.areaKey).toBe('IN|KA|Bengaluru|Whitefield');
    // ...but none of them is hierarchy identity.
    expect(state.node).toBeNull();
  });
});

describe('navigation URL domain — `areasPreview` read (AC1.3)', () => {
  it('is true for areasPreview=1', () => {
    const { result } = renderFacade('/discover?city=bangalore&areasPreview=1');
    expect(result.current.urlState[0].areasPreview).toBe(true);
  });

  it('is undefined when absent', () => {
    const { result } = renderFacade('/discover?city=bangalore');
    expect(result.current.urlState[0].areasPreview).toBeUndefined();
  });

  it.each(['0', 'true', '', 'yes'])('is undefined for areasPreview=%j', (raw) => {
    const { result } = renderFacade(`/discover?city=bangalore&areasPreview=${raw}`);
    expect(result.current.urlState[0].areasPreview).toBeUndefined();
  });
});

describe('AC1.3 — areasPreview survives navigation, and is never written', () => {
  it('survives an area selection (preview navigation)', () => {
    const { result } = renderFacade('/discover?city=bangalore&areasPreview=1&journey=area-first');
    act(() => {
      result.current.urlState[1].selectArea('IN|KA|Bengaluru|Whitefield');
    });
    expect(result.current.location.search).toContain('areasPreview=1');
    expect(result.current.urlState[0].areasPreview).toBe(true);
  });

  it('survives a journey switch', () => {
    const { result } = renderFacade('/discover?city=bangalore&areasPreview=1');
    act(() => {
      result.current.urlState[1].setJourney('area-first');
    });
    expect(result.current.urlState[0].areasPreview).toBe(true);
  });

  it('survives a group selection', () => {
    const { result } = renderFacade('/discover?city=bangalore&areasPreview=1&journey=area-first');
    act(() => {
      result.current.urlState[1].selectGroup('whitefield-belt');
    });
    expect(result.current.urlState[0].areasPreview).toBe(true);
  });

  it.each([
    ['selectArea', (a: ReturnType<typeof useDiscoverUrlState>[1]) => a.selectArea('IN|KA|B|W')],
    ['setJourney', (a: ReturnType<typeof useDiscoverUrlState>[1]) => a.setJourney('area-first')],
    ['selectGroup', (a: ReturnType<typeof useDiscoverUrlState>[1]) => a.selectGroup('g1')],
    ['deselectArea', (a: ReturnType<typeof useDiscoverUrlState>[1]) => a.deselectArea()],
    ['startOver', (a: ReturnType<typeof useDiscoverUrlState>[1]) => a.startOver()],
    ['setIntent', (a: ReturnType<typeof useDiscoverUrlState>[1]) => a.setIntent('rent')],
  ])('an ordinary interaction (%s) never introduces areasPreview', (_name, invoke) => {
    const { result } = renderFacade('/discover?city=bangalore&journey=area-first&areaKey=IN%7CKA%7CB%7CW');
    act(() => {
      invoke(result.current.urlState[1]);
    });
    expect(result.current.location.search).not.toContain('areasPreview');
    expect(result.current.urlState[0].areasPreview).toBeUndefined();
  });

  it('startOver drops areasPreview — Start Over is a full reset, not preview navigation', () => {
    const { result } = renderFacade('/discover?city=bangalore&areasPreview=1&journey=area-first');
    act(() => {
      result.current.urlState[1].startOver();
    });
    expect(result.current.location.search).not.toContain('areasPreview');
  });
});

describe('AC1.3 — no writer for areasPreview exists anywhere (canonical/share URLs omit it)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.resolve(here, '../../../../../..', 'src');

  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, acc);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        acc.push(full);
      }
    }
    return acc;
  }

  it('no production module sets the areasPreview param', () => {
    const offenders = walk(srcRoot)
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        // Mutation sites only — doc comments naming the param are fine.
        return (
          source.includes(`set('areasPreview'`) ||
          source.includes(`set("areasPreview"`) ||
          source.includes(`append('areasPreview'`) ||
          source.includes(`append("areasPreview"`)
        );
      });

    expect(offenders).toEqual([]);
  });
});
