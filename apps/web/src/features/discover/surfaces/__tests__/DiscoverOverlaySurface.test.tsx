/**
 * #2750 PR-5 B1 T4 — DiscoverOverlaySurface mount tests (telemetry consent UI).
 *
 * Retires the mount half of the e2e spec discover-telemetry-consent-1576:
 *  - 1576-N3: undecided consent -> the surface mounts the consent banner AND the privacy toggle
 *  - 1576-N4: granted consent  -> the privacy toggle is mounted, the banner is not
 *
 * The surface is rendered with the REAL DiscoverConsentBanner / DiscoverPrivacyToggle and the REAL
 * consent util (jsdom localStorage). NearSchoolSheet is not rendered (view.nearSchool.visible=false).
 * Storage is cleared before AND after every test so no state leaks between the two arms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoverOverlaySurface } from '../DiscoverOverlaySurface';
import type {
  DiscoverOverlaySurfaceView,
  DiscoverOverlaySurfaceCommands,
} from '../buildOverlaySurfaceModel';

const CONSENT_KEY = 'discover_telemetry_consent';

const view: DiscoverOverlaySurfaceView = {
  nearSchool: {
    visible: false,
    open: false,
    selectedSchool: null,
    filters: {},
    boardFilter: [],
    city: null,
  },
};

function makeCommands(): DiscoverOverlaySurfaceCommands {
  return {
    setNearSchoolOpen: vi.fn(),
    onSchoolSelect: vi.fn(),
    onFiltersChange: vi.fn(),
    onBoardFilterChange: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('DiscoverOverlaySurface — telemetry consent mounts', () => {
  // #2750 PR-5 1576-N3
  it('undecided consent: the overlay surface mounts the consent banner and the privacy toggle', () => {
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    render(<DiscoverOverlaySurface view={view} commands={makeCommands()} />);

    const banner = screen.getByTestId('discover-consent-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('role', 'dialog');
    expect(screen.getByRole('button', { name: /accept anonymous usage data collection/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline anonymous usage data collection/i })).toBeInTheDocument();

    const toggle = screen.getByTestId('discover-privacy-toggle');
    expect(toggle).toBeInTheDocument();
    // Undecided = not granted: the toggle reads Off.
    expect(toggle).toHaveTextContent('Off');
  });

  // #2750 PR-5 1576-N4
  it('granted consent: the privacy toggle is mounted and the banner is not', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    render(<DiscoverOverlaySurface view={view} commands={makeCommands()} />);

    const toggle = screen.getByTestId('discover-privacy-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent('On');
    expect(screen.queryByTestId('discover-consent-banner')).not.toBeInTheDocument();
  });
});
