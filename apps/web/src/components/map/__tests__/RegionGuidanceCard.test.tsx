/**
 * Issue #1808 — RegionGuidanceCard unit tests.
 *
 * Covers: q1 marker-accurate copy (zones/areas/generic variants), the
 * no-withholding-language guard, role="note" + aria-labelledby semantics,
 * the dismiss button, and the pulse/reduced-motion class gating.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegionGuidanceCard } from '../RegionGuidanceCard';

// user decision q1 (approved-plan.toml [decisions].q1_copy_wording) — this exact
// wording was DECLINED and must never appear in any rendered guidance string.
const WITHHOLDING_PHRASE = /top areas only|not the full list|not all areas|preview/i;

describe('RegionGuidanceCard', () => {
  it('renders role=note with aria-labelledby pointing at the region title', () => {
    render(
      <RegionGuidanceCard
        regionName="East Bangalore"
        markerKind={null}
        pulseEligible={false}
        prefersReducedMotion={false}
        onDismiss={vi.fn()}
      />,
    );
    const note = screen.getByRole('note');
    expect(note).toHaveAttribute('aria-labelledby');
    const titleId = note.getAttribute('aria-labelledby')!;
    expect(document.getElementById(titleId)).toHaveTextContent('East Bangalore');
  });

  it('never renders role=alert (never an error state)', () => {
    render(
      <RegionGuidanceCard
        regionName="East Bangalore"
        markerKind="zones"
        pulseEligible={false}
        prefersReducedMotion={false}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('markerKind="zones" — multi-group region body matches the locked q1 zones copy', () => {
    render(
      <RegionGuidanceCard
        regionName="East Bangalore"
        markerKind="zones"
        pulseEligible={false}
        prefersReducedMotion={false}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Showing the zones of East Bangalore — pick one to see its areas.'),
    ).toBeInTheDocument();
  });

  it('markerKind="areas" — single-group region body matches the locked q1 areas copy', () => {
    render(
      <RegionGuidanceCard
        regionName="South Udupi"
        markerKind="areas"
        pulseEligible={false}
        prefersReducedMotion={false}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Showing the areas of South Udupi.')).toBeInTheDocument();
  });

  it('markerKind=null — generic fallback while markers are still resolving', () => {
    render(
      <RegionGuidanceCard
        regionName="North Bangalore"
        markerKind={null}
        pulseEligible={false}
        prefersReducedMotion={false}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Showing an overview of North Bangalore.')).toBeInTheDocument();
  });

  it.each(['zones', 'areas', null] as const)(
    'markerKind=%s — no rendered string ever contains withholding language (q1 guard)',
    (markerKind) => {
      const { container } = render(
        <RegionGuidanceCard
          regionName="East Bangalore"
          markerKind={markerKind}
          pulseEligible={true}
          prefersReducedMotion={false}
          onDismiss={vi.fn()}
        />,
      );
      expect(container.textContent).not.toMatch(WITHHOLDING_PHRASE);
    },
  );

  it('dismiss button is a real <button> with the exact aria-label and fires onDismiss', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <RegionGuidanceCard
        regionName="East Bangalore"
        markerKind="zones"
        pulseEligible={false}
        prefersReducedMotion={false}
        onDismiss={onDismiss}
      />,
    );
    const dismissButton = screen.getByRole('button', { name: 'Dismiss region guidance' });
    await user.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('pulseEligible=true + prefersReducedMotion=false → arrow nudge class applied', () => {
    const { container } = render(
      <RegionGuidanceCard
        regionName="East Bangalore"
        markerKind="zones"
        pulseEligible={true}
        prefersReducedMotion={false}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.querySelector('.dp-cue-arrow--nudge-x, .dp-cue-arrow--nudge-y')).not.toBeNull();
  });

  it('prefersReducedMotion=true → arrow nudge class suppressed even when pulseEligible', () => {
    const { container } = render(
      <RegionGuidanceCard
        regionName="East Bangalore"
        markerKind="zones"
        pulseEligible={true}
        prefersReducedMotion={true}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.querySelector('.dp-cue-arrow--nudge-x, .dp-cue-arrow--nudge-y')).toBeNull();
  });

  it('pulseEligible=false (deep-link source) → arrow nudge class never applied', () => {
    const { container } = render(
      <RegionGuidanceCard
        regionName="East Bangalore"
        markerKind="zones"
        pulseEligible={false}
        prefersReducedMotion={false}
        onDismiss={vi.fn()}
      />,
    );
    expect(container.querySelector('.dp-cue-arrow--nudge-x, .dp-cue-arrow--nudge-y')).toBeNull();
  });
});
