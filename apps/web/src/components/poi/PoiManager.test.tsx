/**
 * PoiManager unit tests — issue #2042, extended by issue #2642.
 *
 * GET /pois/suggestions wraps its response as { pois, providerIssue }. The "Suggested nearby
 * places" tab must render three DISTINCT states rather than collapsing two of them into the same
 * copy:
 *   1. populated        — pois.length > 0
 *   2. genuine empty     — pois.length === 0, providerIssue === false
 *   3. provider failure   — pois.length === 0, providerIssue === true (must NOT read as a
 *                          confirmed empty result)
 * A fourth state, request failure (network/HTTP error before a response body exists), is
 * already handled by react-query's isError and must remain distinct from both empty states.
 *
 * Issue #2642 restructures the panel into three explicit modes (Suggested / Approved / Add
 * manually), adds a Retry action for provider failure, and simplifies manual POI entry to
 * name/category/optional distance+unit (no geocoding).
 */
import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = vi.hoisted(() => vi.fn());
const mockApiPost = vi.hoisted(() => vi.fn());
const mockApiPatch = vi.hoisted(() => vi.fn());
const mockApiDelete = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: mockApiPost,
    patch: mockApiPatch,
    delete: mockApiDelete,
  },
}));

import {
  PoiManager,
  normalizeDistanceMeters,
  isDistanceInputValid,
  distanceUnitStorageKey,
  getStoredDistanceUnit,
  storeDistanceUnit,
} from './PoiManager';

// jsdom does not implement the PointerEvent capture APIs Radix Select's
// jsdom-only pointer-interaction path calls into — same shim used by
// AgriculturalListingForm.test.tsx / CommercialListingForm.parity.test.tsx.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// This project's jsdom setup cannot reliably drive a Radix Select through a
// full open -> option-click sequence and then continue interacting with the
// page in the same test (see the "Add manually" describe block below for the
// full account and the coverage strategy that works around it). Tests in
// this file therefore avoid completing a Select interaction; `fireEvent` is
// used for direct value changes (`fireEvent.change`) where that's simpler
// than `userEvent.type`. pointerEventsCheck is disabled as a general
// defensive measure against Radix's scroll-lock leaving a stray
// `pointer-events: none` on `document.body`.
function setupUser() {
  return userEvent.setup({ pointerEventsCheck: 0 });
}

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiPost.mockResolvedValue({});
  mockApiPatch.mockResolvedValue({});
  mockApiDelete.mockResolvedValue({});
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('PoiManager — Suggested tab: empty vs provider-failure vs populated (#2042)', () => {
  it('renders returned POIs when the provider succeeds with results', async () => {
    mockApiGet.mockResolvedValue({
      pois: [
        {
          id: 'poi-1',
          name: 'KMC Hospital',
          category: 'HOSPITAL',
          distanceMeters: 300,
          latitude: 13.3534,
          longitude: 74.7893,
          pinned: false,
          approved: false,
        },
      ],
      providerIssue: false,
    });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(await screen.findByText('KMC Hospital')).toBeInTheDocument();
    expect(screen.queryByText(/No nearby places found/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn.?t fetch nearby places/i)).not.toBeInTheDocument();
  });

  it('renders the genuine-empty message (not a provider-failure warning) when providerIssue is false and nothing has ever been approved', async () => {
    mockApiGet.mockResolvedValue({ pois: [], providerIssue: false });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(
      await screen.findByText(/No nearby places were found around this location/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/couldn.?t fetch nearby places/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a place manually' })).toBeInTheDocument();
  });

  it('renders an "all suggestions reviewed" message (not the genuine-empty invitation) when every suggestion has been approved', async () => {
    mockApiGet.mockResolvedValue({
      pois: [
        {
          id: 'poi-1',
          name: 'KMC Hospital',
          category: 'HOSPITAL',
          distanceMeters: 300,
          latitude: 13.3534,
          longitude: 74.7893,
          pinned: false,
          approved: true,
        },
      ],
      providerIssue: false,
    });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(await screen.findByText('All suggestions reviewed')).toBeInTheDocument();
    expect(screen.queryByText(/No nearby places were found around this location/i)).not.toBeInTheDocument();
  });

  it('renders a distinct provider-failure warning (not the genuine-empty copy) when providerIssue is true', async () => {
    mockApiGet.mockResolvedValue({ pois: [], providerIssue: true });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(await screen.findByText(/couldn.?t fetch nearby places/i)).toBeInTheDocument();
    expect(screen.queryByText(/No nearby places were found around this location/i)).not.toBeInTheDocument();
  });

  it('renders the request-failure alert (distinct from both empty states) when the HTTP call itself fails', async () => {
    mockApiGet.mockRejectedValue(new Error('network error'));

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(await screen.findByText(/Failed to load POI suggestions/i)).toBeInTheDocument();
    expect(screen.queryByText(/No nearby places were found around this location/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn.?t fetch nearby places/i)).not.toBeInTheDocument();
  });
});

describe('PoiManager — three explicit modes (issue #2642)', () => {
  it('switches between Suggested, Approved, and Add manually as three distinct tabs', async () => {
    const user = setupUser();
    mockApiGet.mockResolvedValue({
      pois: [
        { id: 'poi-1', name: 'Suggested Place', category: 'SCHOOL', distanceMeters: 500, latitude: 1, longitude: 1, pinned: false, approved: false },
        { id: 'poi-2', name: 'Approved Place', category: 'GROCERY', distanceMeters: 200, latitude: 1, longitude: 1, pinned: false, approved: true },
      ],
      providerIssue: false,
    });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    expect(await screen.findByText('Suggested Place')).toBeInTheDocument();
    expect(screen.queryByText('Approved Place')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /approved/i }));
    expect(await screen.findByText('Approved Place')).toBeInTheDocument();
    expect(screen.queryByText('Suggested Place')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Add manually' }));
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByText('Suggested Place')).not.toBeInTheDocument();
    expect(screen.queryByText('Approved Place')).not.toBeInTheDocument();
  });

  it('shows the Approved tab count badge and does not nest the manual form under Approved', async () => {
    const user = setupUser();
    mockApiGet.mockResolvedValue({
      pois: [
        { id: 'poi-1', name: 'Approved One', category: 'GROCERY', distanceMeters: 200, latitude: 1, longitude: 1, pinned: false, approved: true },
      ],
      providerIssue: false,
    });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    const approvedTab = await screen.findByRole('tab', { name: /approved/i });
    expect(await within(approvedTab).findByText('1')).toBeInTheDocument();

    await user.click(approvedTab);
    expect(await screen.findByText('Approved One')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('hides the pin/unpin action on Suggested rows and labels the remove action "Dismiss"', async () => {
    mockApiGet.mockResolvedValue({
      pois: [
        { id: 'poi-1', name: 'Suggested Place', category: 'SCHOOL', distanceMeters: 500, latitude: 1, longitude: 1, pinned: false, approved: false },
      ],
      providerIssue: false,
    });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    await screen.findByText('Suggested Place');
    expect(screen.queryByRole('button', { name: /pin suggested place/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss Suggested Place' })).toBeInTheDocument();
  });

  it('renders a BROKER-ADDED badge on manually-added approved POIs, and no badge on provider-sourced ones', async () => {
    mockApiGet.mockResolvedValue({
      pois: [
        { id: 'poi-1', name: 'Sri Krishna Temple', category: 'WORSHIP', distanceMeters: null, latitude: null, longitude: null, pinned: false, approved: true, brokerAdded: true },
        { id: 'poi-2', name: 'KMC Hospital', category: 'HOSPITAL', distanceMeters: 300, latitude: 1, longitude: 1, pinned: false, approved: true, brokerAdded: false },
      ],
      providerIssue: false,
    });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    const user = setupUser();
    await user.click(await screen.findByRole('tab', { name: /approved/i }));

    const manualRow = (await screen.findByText('Sri Krishna Temple')).closest('div.flex-1') as HTMLElement;
    expect(within(manualRow).getByText('BROKER-ADDED')).toBeInTheDocument();

    const providerRow = screen.getByText('KMC Hospital').closest('div.flex-1') as HTMLElement;
    expect(within(providerRow).queryByText('BROKER-ADDED')).not.toBeInTheDocument();
  });
});

describe('PoiManager — Retry (issue #2642)', () => {
  it('refetches the suggestions query when Retry is clicked after a provider failure', async () => {
    const user = setupUser();
    mockApiGet.mockResolvedValue({ pois: [], providerIssue: true });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    await screen.findByText(/couldn.?t fetch nearby places/i);
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('keeps "add a place manually" reachable while the provider is failing', async () => {
    const user = setupUser();
    mockApiGet.mockResolvedValue({ pois: [], providerIssue: true });

    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);

    await user.click(await screen.findByText('You can still add a place manually.'));
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
  });
});

describe('PoiManager — Add manually (issue #2642 V1 simplification)', () => {
  async function openManualTab() {
    mockApiGet.mockResolvedValue({ pois: [], providerIssue: false });
    renderWithClient(<PoiManager listingId="listing-1" propertyType="house" />);
    const user = setupUser();
    await user.click(await screen.findByRole('tab', { name: 'Add manually' }));
    await screen.findByLabelText('Name');
    return user;
  }

  // NOTE ON TEST STRATEGY: this project's jsdom test environment cannot
  // reliably drive a Radix Select through open -> option-click -> further
  // interaction in the same test — even with this repo's own established
  // hasPointerCapture/setPointerCapture shims (see above), the FIRST
  // Select open+close in this describe block leaves the test in a state
  // where every subsequent interaction (via userEvent OR fireEvent, on the
  // Select or on unrelated elements) hangs indefinitely or times out. This
  // reproduces even in an isolated single-test file, so it is a pre-existing
  // Radix+jsdom environment gap, not a defect in AddManualForm.
  //
  // Coverage strategy given that constraint:
  //  1. The exact business logic a category-select-driven submission would
  //     exercise (distance validity, km/m normalization, listing-scoped
  //     storage) is unit-tested directly against the exported pure
  //     functions below — deterministic and immune to the Select hang.
  //  2. DOM-level behaviour that does NOT require completing a Select
  //     interaction (rendering, distance validation hint/disabled-state,
  //     unit-select default value from storage) is covered here.
  //  3. Manual functional/browser verification is required for the actual
  //     category-select -> submit -> normalized distanceMeters wiring
  //     before merge; this is called out explicitly in the PR evidence.

  it('renders Name (required), Category (required), and optional Distance fields with the V1 copy', async () => {
    await openManualTab();

    expect(screen.getByLabelText('Name')).toBeRequired();
    expect(screen.getByRole('combobox', { name: /category/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Distance from property/i)).toBeInTheDocument();
    expect(screen.getByText(/optional/i)).toBeInTheDocument();
    expect(
      screen.getByText('Add the approximate distance if you know it — you can leave this blank.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Places you add are labelled broker-added, not platform-verified.'),
    ).toBeInTheDocument();
    // Blank distance + no name/category yet: submit disabled by missing fields, not by distance.
    expect(screen.getByRole('button', { name: 'Add place' })).toBeDisabled();
    expect(screen.queryByText('Enter a positive number, like 1.3 or 850.')).not.toBeInTheDocument();
  });

  it('rejects zero and negative distances, disabling submit and showing the validation hint', async () => {
    await openManualTab();

    fireEvent.change(screen.getByLabelText(/Distance from property/i), { target: { value: '0' } });
    expect(screen.getByText('Enter a positive number, like 1.3 or 850.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Distance from property/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Add place' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Distance from property/i), { target: { value: '-5' } });
    expect(screen.getByText('Enter a positive number, like 1.3 or 850.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add place' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Distance from property/i), { target: { value: '1.3' } });
    expect(screen.queryByText('Enter a positive number, like 1.3 or 850.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Distance from property/i)).toHaveAttribute('aria-invalid', 'false');

    fireEvent.change(screen.getByLabelText(/Distance from property/i), { target: { value: '' } });
    expect(screen.queryByText('Enter a positive number, like 1.3 or 850.')).not.toBeInTheDocument();

    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('defaults the distance unit to the value persisted for this listing, scoped per listing', async () => {
    window.localStorage.setItem('poi-manual-distance-unit:listing-1', 'm');
    window.localStorage.setItem('poi-manual-distance-unit:listing-OTHER', 'm');
    await openManualTab();

    expect(screen.getByRole('combobox', { name: 'Distance unit' })).toHaveTextContent('m');
  });

  it('defaults to km when nothing is stored for this listing, regardless of another listing\'s stored unit', async () => {
    window.localStorage.setItem('poi-manual-distance-unit:listing-OTHER', 'm');
    await openManualTab();

    expect(screen.getByRole('combobox', { name: 'Distance unit' })).toHaveTextContent('km');
  });
});

describe('PoiManager — Add-manually normalization & persistence helpers (pure functions, issue #2642)', () => {
  it('normalizes km to metres by rounding (1.3 km -> 1300)', () => {
    expect(normalizeDistanceMeters('1.3', 'km')).toBe(1300);
  });

  it('normalizes metres as-is by rounding (850 m -> 850)', () => {
    expect(normalizeDistanceMeters('850', 'm')).toBe(850);
  });

  it('rounds a fractional metres value', () => {
    expect(normalizeDistanceMeters('849.6', 'm')).toBe(850);
  });

  it('treats blank as valid, and positive numeric strings as valid', () => {
    expect(isDistanceInputValid('')).toBe(true);
    expect(isDistanceInputValid('1.3')).toBe(true);
    expect(isDistanceInputValid('850')).toBe(true);
    expect(isDistanceInputValid('.5')).toBe(true);
  });

  it('rejects zero, negative, and non-numeric distance input', () => {
    expect(isDistanceInputValid('0')).toBe(false);
    expect(isDistanceInputValid('-5')).toBe(false);
    expect(isDistanceInputValid('abc')).toBe(false);
    expect(isDistanceInputValid('1.3km')).toBe(false);
  });

  it('scopes the storage key per listing', () => {
    expect(distanceUnitStorageKey('listing-1')).toBe('poi-manual-distance-unit:listing-1');
    expect(distanceUnitStorageKey('listing-1')).not.toBe(distanceUnitStorageKey('listing-2'));
  });

  it('round-trips a stored unit for its own listing without leaking to another listing', () => {
    storeDistanceUnit('listing-1', 'm');
    expect(getStoredDistanceUnit('listing-1')).toBe('m');
    expect(getStoredDistanceUnit('listing-2')).toBe('km'); // no stored preference of its own
  });

  it('falls back to km for a listing with no stored preference', () => {
    expect(getStoredDistanceUnit('never-stored-listing')).toBe('km');
  });
});
