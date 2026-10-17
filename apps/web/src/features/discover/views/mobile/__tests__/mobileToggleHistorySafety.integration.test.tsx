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
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import { useDiscoverActions, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';

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

// #2750 PR-5 B1 T3 — issue-2015-search-this-area-viewport AC8 (the Map/List toggle survives a VIEWPORT activation).
// The shared setup.ts matchMedia stub always reports matches:false (desktop), where mobileView is never reset, so this
// `it` installs its OWN mobile matchMedia (matches:true) and puts the real DiscoverProvider in the mobile shell.
function ScopeCommitHarness() {
  const { commitResultScope } = useDiscoverActions();
  return (
    <>
      <button
        type="button"
        data-testid="commit-viewport-a"
        onClick={() =>
          commitResultScope({ kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.5, n: 13.0, e: 77.6 } }, { history: 'replace' })
        }
      >
        Search this area A
      </button>
      <button
        type="button"
        data-testid="commit-viewport-b"
        onClick={() =>
          commitResultScope({ kind: 'VIEWPORT', bounds: { s: 12.95, w: 77.5, n: 13.05, e: 77.6 } }, { history: 'replace' })
        }
      >
        Search this area B
      </button>
    </>
  );
}

describe('mobile Map/List toggle — survives a VIEWPORT scope commit (#2750 PR-5 2015-N17)', () => {
  // #2750 PR-5 2015-N17
  it('committing a VIEWPORT scope while in MAP view keeps mobileView MAP (and a LIST view stays LIST)', async () => {
    const originalMatchMedia = window.matchMedia;
    const mobileMql = {
      matches: true,
      media: '(max-width: 820px)',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mobileMql),
    });
    try {
      const user = userEvent.setup();
      window.history.pushState({}, '', '/discover?city=udupi&journey=area-first&node=root');

      render(
        <QueryClientProvider client={makeQC()}>
          <BrowserRouter>
            <DiscoverProvider>
              <ToggleHarness />
              <ScopeCommitHarness />
            </DiscoverProvider>
          </BrowserRouter>
        </QueryClientProvider>,
      );

      // The mobile shell is really active (a stub reporting desktop would make the rest of this vacuous).
      expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 820px)');
      expect(screen.getByTestId('mobile-view-value')).toHaveTextContent('LIST');

      // MAP arm: open the map, then commit a VIEWPORT scope through the real facade (the URL changes).
      await user.click(screen.getByTestId('open-map'));
      expect(screen.getByTestId('mobile-view-value')).toHaveTextContent('MAP');
      const searchBeforeCommit = window.location.search;
      await user.click(screen.getByTestId('commit-viewport-a'));
      expect(new URLSearchParams(window.location.search).get('rscope')).toBe('vp');
      expect(window.location.search).not.toBe(searchBeforeCommit);
      expect(screen.getByTestId('mobile-view-value')).toHaveTextContent('MAP');

      // LIST arm: back to the list, a second VIEWPORT commit (new bounds, another URL change) leaves it on LIST.
      await user.click(screen.getByTestId('close-map'));
      expect(screen.getByTestId('mobile-view-value')).toHaveTextContent('LIST');
      const searchBeforeSecond = window.location.search;
      await user.click(screen.getByTestId('commit-viewport-b'));
      expect(window.location.search).not.toBe(searchBeforeSecond);
      expect(screen.getByTestId('mobile-view-value')).toHaveTextContent('LIST');
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
});
