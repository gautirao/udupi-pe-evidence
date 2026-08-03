/**
 * Issue #1956 PR 1 (FE-1) — the `node` URL capability domain. Issue #1956 PR 6
 * (final cutover, RULED A1 MINIMAL) removed the `areasPreview` deployment-
 * preview opt-in flag entirely — the canonical Areas journey is now the
 * default for `journey==='area-first'`, so the describe blocks that exercised
 * `areasPreview`'s presence-flag read, its survival-across-navigation
 * behaviour, and the "no writer exists" static sweep are removed with it.
 *
 * Covers:
 *  - `node` read + whitespace/empty normalisation (AC1.4 parse discipline)
 *  - AC1.4 — no Areas-hierarchy identity is derived from groupId/region/areaKey/
 *    scope: `node` is read from `node` alone
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
