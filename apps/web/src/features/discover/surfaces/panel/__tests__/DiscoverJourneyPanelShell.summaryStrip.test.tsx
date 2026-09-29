/**
 * The visible journey summary strip ("9 areas · 21 properties · Locality
 * insights" and its school/agri equivalents) used to live only inside the
 * panel's own `JourneySwitcher`. Hiding that switcher at widths where the
 * shared header hosts the journey tabs silently dropped the strip too.
 * `DiscoverJourneyPanelShell` now renders `JourneySummaryStrip` on its own
 * whenever the switcher it would have shown was non-compact (the city-root /
 * guided-entry density), so the content survives in its exact former spot
 * with no duplicate.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverJourneyPanelShell } from '../DiscoverJourneyPanelShell';

function renderShell(props: Partial<Parameters<typeof DiscoverJourneyPanelShell>[0]> = {}) {
  // headerHostsJourneyTabs defaults to whatever hostsHeaderControls resolves
  // to (the two coincide outside an unresolved admin preview), so every
  // existing call site below that only overrides hostsHeaderControls keeps
  // working unchanged; a test for the divergent (preview) case overrides
  // both explicitly.
  const hostsHeaderControls = props.hostsHeaderControls ?? false;
  return render(
    <MemoryRouter>
      <DiscoverJourneyPanelShell
        testId="discover-areas-journey-panel-shell"
        // Mobile so DiscoverControlBar (which needs Discover context/query providers
        // this focused harness doesn't set up) never mounts — orthogonal to what this
        // suite tests (the switcher/strip split), gated by hostsHeaderControls alone.
        isMobileShell
        hostsHeaderControls={false}
        headerHostsJourneyTabs={hostsHeaderControls}
        activeJourney="area-first"
        compact={false}
        cityLabel="Bangalore"
        totalProperties={21}
        areasCount={9}
        prefersReducedMotion={false}
        onSelectJourney={() => {}}
        {...props}
      >
        <div>panel body</div>
      </DiscoverJourneyPanelShell>
    </MemoryRouter>,
  );
}

describe('DiscoverJourneyPanelShell — journey summary strip restoration', () => {
  it('below the header-hosting width (panel owns the switcher): the switcher renders its OWN strip, exactly once', () => {
    renderShell({ hostsHeaderControls: false, compact: false });
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
    expect(screen.getAllByTestId('journey-metadata-strip')).toHaveLength(1);
  });

  it('at the header-hosting width, city-root density: the switcher is hidden but the strip is restored standalone, exactly once', () => {
    renderShell({ hostsHeaderControls: true, compact: false });
    expect(screen.queryByTestId('journey-switcher-section')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('journey-metadata-strip')).toHaveLength(1);
  });

  it('at the header-hosting width, deeper (compact) density: neither the switcher nor the strip renders — no regression at non-city-root states', () => {
    renderShell({ hostsHeaderControls: true, compact: true });
    expect(screen.queryByTestId('journey-switcher-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('journey-metadata-strip')).not.toBeInTheDocument();
  });

  it('below the header-hosting width, deeper (compact) density: the switcher renders compact with no strip (matches its own !isCompact gate)', () => {
    renderShell({ hostsHeaderControls: false, compact: true });
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
    expect(screen.queryByTestId('journey-metadata-strip')).not.toBeInTheDocument();
  });

  it('the restored standalone strip carries the school-first content, not area-first, when activeJourney is school-first', () => {
    renderShell({ hostsHeaderControls: true, compact: false, activeJourney: 'school-first' });
    expect(screen.getByText('5 or 10 km radius')).toBeInTheDocument();
    expect(screen.getByText('Homes near schools')).toBeInTheDocument();
  });

  // The header can host controls (hostsHeaderControls=true, so the shell does
  // NOT render its own copy of the control bar) while still not rendering the
  // journey tabs (headerHostsJourneyTabs=false, an unresolved admin
  // city-launch preview). The panel must fall back to its own switcher
  // exactly as it does below the header threshold — zero journey selectors is
  // never acceptable.
  it('header hosts controls but not journey tabs (unresolved preview): the switcher renders (with its own strip), never the standalone strip alone', () => {
    renderShell({ hostsHeaderControls: true, headerHostsJourneyTabs: false, compact: false });
    expect(screen.getByTestId('journey-switcher-section')).toBeInTheDocument();
    expect(screen.getAllByTestId('journey-metadata-strip')).toHaveLength(1);
  });
});
