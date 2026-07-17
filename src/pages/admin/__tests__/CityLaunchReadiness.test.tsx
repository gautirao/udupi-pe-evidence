/**
 * Issue #1911 PR4 — CityLaunchReadiness tests.
 *
 * VALIDATED + non-superseded renders the go/no-go summary with all 5 checks
 * shown ticked, and the Launch entry is strictly INERT: disabled, no
 * onClick calling any endpoint, no navigation, no type-to-confirm (that's
 * PR5's contract).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CityLaunchReadiness from '../CityLaunchReadiness';
import type { ValidationStateDto } from '@/hooks/useCityLaunchValidation';

// CityLaunchReadiness only imports the ValidationStateDto TYPE from
// useCityLaunchValidation.ts, but that module also imports '@/lib/api',
// which imports the Supabase client — and Supabase throws at module-load
// time when VITE_SUPABASE_URL isn't set in the test environment (see repo
// convention in CityLaunchPreview.test.tsx). Stub it out the same way.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })) },
  },
}));

const VALIDATED_STATE: ValidationStateDto = {
  revisionId: 42,
  cityId: 7,
  revisionNumber: 3,
  lifecycleStatus: 'VALIDATED',
  checks: { landing: true, regions: true, areaGroups: true, areas: true, listing: true },
  allValidated: true,
  editable: false,
  preparedAt: '2026-07-01T00:00:00Z',
  validatedAt: '2026-07-02T00:00:00Z',
  supersededBy: null,
};

describe('CityLaunchReadiness', () => {
  it('renders the VALIDATED summary with all 5 checks shown ticked', () => {
    render(<CityLaunchReadiness validation={VALIDATED_STATE} />);

    expect(screen.getByText('VALIDATED')).toBeInTheDocument();
    expect(screen.getByText(/rev 3/)).toBeInTheDocument();

    for (const label of ['Landing', 'Regions', 'Area Groups', 'Areas', 'Listing']) {
      expect(screen.getByText(new RegExp(`^${label} —`))).toBeInTheDocument();
    }
    expect(screen.getAllByText('pass')).toHaveLength(5);
  });

  it('renders preparedAt/validatedAt', () => {
    render(<CityLaunchReadiness validation={VALIDATED_STATE} />);
    expect(screen.getByText('2026-07-01T00:00:00Z')).toBeInTheDocument();
    expect(screen.getByText('2026-07-02T00:00:00Z')).toBeInTheDocument();
  });

  it('the Launch entry is INERT: disabled and fires no click handler', async () => {
    render(<CityLaunchReadiness validation={VALIDATED_STATE} />);

    const launchButton = screen.getByTestId('launch-entry-inert');
    expect(launchButton).toBeDisabled();
    expect(launchButton).toHaveAttribute('aria-disabled', 'true');

    // A disabled button fires no click handler in jsdom/testing-library —
    // clicking it must not throw and must not invoke any endpoint. There is
    // no onClick prop at all on this button (verified by reading the
    // component), so this is a behavioural smoke check, not a mock-call
    // assertion.
    await userEvent.click(launchButton);
    expect(launchButton).toBeDisabled();
  });

  it('renders no type-to-confirm input (PR5-only contract)', () => {
    render(<CityLaunchReadiness validation={VALIDATED_STATE} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
