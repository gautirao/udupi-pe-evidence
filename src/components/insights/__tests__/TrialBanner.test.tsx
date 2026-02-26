import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrialBanner } from '../TrialBanner';

// ─── Tests ────────────────────────────────────────────────────
describe('TrialBanner', () => {
  it('renders "1 day" (singular) when daysRemaining=1', () => {
    render(<TrialBanner daysRemaining={1} />);
    expect(screen.getByText(/1 day[^s]/)).toBeInTheDocument();
  });

  it('renders "2 days" (plural) when daysRemaining=2', () => {
    render(<TrialBanner daysRemaining={2} />);
    expect(screen.getByText(/2 days/)).toBeInTheDocument();
  });

  it('renders and is visible (role=alert present) when daysRemaining=3', () => {
    render(<TrialBanner daysRemaining={3} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('clicking dismiss removes banner from DOM', async () => {
    const user = userEvent.setup();
    render(<TrialBanner daysRemaining={2} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /dismiss trial banner/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles daysRemaining=0', () => {
    render(<TrialBanner daysRemaining={0} />);
    expect(screen.getByText(/0 days/i)).toBeInTheDocument();
  });

  // Note: TrialBanner has NO internal gate on daysRemaining > 3.
  // The parent (Insights.tsx) controls mounting via: showTrialBanner = hasAccess && daysRemaining <= 3.
  // This component always renders if mounted, regardless of the daysRemaining value.
  it('renders when daysRemaining=4 (parent controls mounting, not this component)', () => {
    render(<TrialBanner daysRemaining={4} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
