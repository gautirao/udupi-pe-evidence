/**
 * Issue #1956 PR-5 (Slice 2, AC5.5 — FIRST-CLASS) — integration proof that
 * the Map/List toggle (`useDiscoverShell().mobileView`/`setMobileView`)
 * writes NEITHER `node=` NOR browser history.
 *
 * `mobileView` is plain `useState` inside `DiscoverProvider`
 * (`DiscoverContext.tsx`, "Shell" section) — never serialised to the URL,
 * never pushed to history. This test proves that property holds by driving
 * the REAL facade (`useDiscoverShell`) inside a REAL `BrowserRouter` (not
 * `MemoryRouter`, which never touches `window.history` at all and would
 * make this assertion vacuous) so `window.history.length`/
 * `window.location.search` are the SAME jsdom APIs a real browser exposes.
 *
 * This is a jsdom-level proof of the STATE MECHANISM only — it does not
 * (and cannot) prove real-browser Back-button semantics after the cycle;
 * that is the job of the real-browser E2E capture
 * (e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts), per this PR's
 * `[test_strategy].jsdom_cannot_prove` note.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { useDiscoverShell } from '@/features/discover/context/useDiscoverContext';

function ToggleHarness() {
  const { mobileView, setMobileView } = useDiscoverShell();
  return (
    <div>
      <p data-testid="mobile-view-value">{mobileView}</p>
      <button type="button" onClick={() => setMobileView('MAP')} data-testid="open-map">
        Map
      </button>
      <button type="button" onClick={() => setMobileView('LIST')} data-testid="close-map">
        List
      </button>
    </div>
  );
}

const makeQC = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('mobile Map/List toggle — history/URL safety (AC5.5)', () => {
  it('a full LIST -> MAP -> LIST cycle writes neither node= nor a history entry', async () => {
    const user = userEvent.setup();
    // Issue #1956 PR-6 (final cutover) — journey=area-first alone is now a
    // realistic Areas-journey URL (the areasPreview dual gate is retired); the
    // toggle's history-safety is independent of this, but starting from a
    // representative URL keeps the harness honest.
    window.history.pushState({}, '', '/discover?city=udupi&journey=area-first&node=root');
    const historyLengthBefore = window.history.length;
    const searchBefore = window.location.search;

    render(
      <QueryClientProvider client={makeQC()}>
        <BrowserRouter>
          <DiscoverProvider>
            <ToggleHarness />
          </DiscoverProvider>
        </BrowserRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('mobile-view-value')).toHaveTextContent('LIST');

    await user.click(screen.getByTestId('open-map')); // LIST -> MAP
    expect(screen.getByTestId('mobile-view-value')).toHaveTextContent('MAP');
    expect(window.location.search).toBe(searchBefore);
    expect(window.history.length).toBe(historyLengthBefore);

    await user.click(screen.getByTestId('close-map')); // MAP -> LIST
    expect(screen.getByTestId('mobile-view-value')).toHaveTextContent('LIST');
    expect(window.location.search).toBe(searchBefore);
    expect(window.history.length).toBe(historyLengthBefore);
  });
});
