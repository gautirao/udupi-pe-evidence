/**
 * Same restoration as `DiscoverJourneyPanelShell`'s own summary-strip suite,
 * for the legacy `RightPanelFrame` path (agri-first and any other state still
 * routed through `LegacyRightPanelBridge`). The strip only ever showed here
 * at the true `guided-entry` panelContent (`!isMobileShell`, journey-less
 * bare landing) — every other legacy state (including `agri-landing`) was
 * ALREADY compact and stripless before the header ever hosted the switcher,
 * so this suite also pins that non-regression.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RightPanelFrame } from '../RightPanelFrame';
import type { RightPanelFrameView } from '@/features/discover/right-panel/contracts';

// DiscoverControlBar needs Discover context/query providers this focused
// harness doesn't set up, and is orthogonal to what this suite tests (the
// switcher/strip split) — stubbed out, same pattern other panel tests use.
vi.mock('@/components/discover/DiscoverControlBar', () => ({
  DiscoverControlBar: () => <div data-testid="stub-control-bar" />,
}));

function baseView(overrides: Partial<RightPanelFrameView['layout']> = {}): RightPanelFrameView {
  // headerHostsJourneyTabs defaults to whatever hostsHeaderControls resolves
  // to (the two coincide outside an unresolved admin preview), so every
  // existing call site below that only overrides hostsHeaderControls keeps
  // working unchanged; a test for the divergent (preview) case overrides
  // both explicitly.
  const hostsHeaderControls = overrides.hostsHeaderControls ?? false;
  return {
    layout: {
      panelContent: 'guided-entry',
      isMobileShell: false,
      hostsHeaderControls,
      headerHostsJourneyTabs: hostsHeaderControls,
      footer: null,
      ...overrides,
    },
    counts: { totalProperties: 21, areasCount: 9 },
    regionGuide: {
      ringActive: false,
      markerKind: null,
      nonce: 0,
      prefersReducedMotion: false,
      helperText: '',
    },
  } as unknown as RightPanelFrameView;
}

function renderFrame(
  layoutOverrides: Partial<RightPanelFrameView['layout']> = {},
  contextJourney: 'area-first' | 'school-first' | 'agri-first' | null = null,
) {
  return render(
    <RightPanelFrame
      view={baseView(layoutOverrides)}
      context={{ journey: contextJourney, cityLabel: 'Bangalore', city: 'bangalore' }}
      chrome={{ activeContextChips: null }}
      onSelectJourney={() => {}}
    >
      <div>panel body</div>
    </RightPanelFrame>,
  );
}

describe('RightPanelFrame — journey summary strip restoration (legacy/agri path)', () => {
  it('below the header-hosting width, at guided-entry: the switcher renders its OWN strip, exactly once', () => {
    renderFrame({ hostsHeaderControls: false, panelContent: 'guided-entry' });
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
    expect(screen.getAllByTestId('journey-metadata-strip')).toHaveLength(1);
  });

  it('at the header-hosting width, at guided-entry: the switcher is hidden but the strip is restored standalone, exactly once', () => {
    renderFrame({ hostsHeaderControls: true, panelContent: 'guided-entry' });
    expect(screen.queryByTestId('journey-switcher-section')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('journey-metadata-strip')).toHaveLength(1);
  });

  it('at the header-hosting width, agri-landing (NOT guided-entry): no strip — matches base, which was already compact/stripless here', () => {
    renderFrame({ hostsHeaderControls: true, panelContent: 'agri-landing' }, 'agri-first');
    expect(screen.queryByTestId('journey-switcher-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('journey-metadata-strip')).not.toBeInTheDocument();
  });

  it('below the header-hosting width, agri-landing: the switcher renders compact with no strip (unchanged from base)', () => {
    renderFrame({ hostsHeaderControls: false, panelContent: 'agri-landing' }, 'agri-first');
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
    expect(screen.queryByTestId('journey-metadata-strip')).not.toBeInTheDocument();
  });

  it('on mobile at guided-entry with the header hosting controls: no standalone strip (mobile never had the control-bar/strip row here)', () => {
    renderFrame({ hostsHeaderControls: true, isMobileShell: true, panelContent: 'guided-entry' });
    expect(screen.queryByTestId('journey-metadata-strip')).not.toBeInTheDocument();
  });

  // The header can host controls (hostsHeaderControls=true, so the panel does
  // NOT render its own copy of the control bar) while still not rendering the
  // journey tabs (headerHostsJourneyTabs=false, an unresolved admin
  // city-launch preview). Zero journey selectors is never acceptable: the
  // panel must fall back to its own switcher exactly as it does below the
  // header threshold, never the standalone strip alone.
  it('header hosts controls but not journey tabs (unresolved preview): the panel switcher renders (with its own strip), and the standalone strip does not double up', () => {
    renderFrame({ hostsHeaderControls: true, headerHostsJourneyTabs: false, panelContent: 'guided-entry' });
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
    expect(screen.getAllByTestId('journey-metadata-strip')).toHaveLength(1);
    // The control bar stays in the header in this state — the panel must not grow a second copy.
    expect(screen.queryByTestId('stub-control-bar')).not.toBeInTheDocument();
  });
});
