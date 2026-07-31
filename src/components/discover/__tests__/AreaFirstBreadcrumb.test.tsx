/**
 * Tests for AreaFirstBreadcrumb (Issue #1606)
 *
 * The area-first selected-area results breadcrumb: Home › City › Group › Area.
 * Must be dynamic + generic across cities/groups/areas, progressively navigable,
 * and free of school-first wording.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AreaFirstBreadcrumb } from '../AreaFirstBreadcrumb';

describe('AreaFirstBreadcrumb', () => {
  it('renders the full Home › City › Group › Area trail', () => {
    render(<AreaFirstBreadcrumb cityLabel="Udupi" groupName="University Belt" areaLabel="Manipal" />);
    const nav = screen.getByTestId('area-first-breadcrumb');
    expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
    expect(screen.getByTestId('breadcrumb-home')).toHaveTextContent('Home');
    expect(screen.getByTestId('breadcrumb-city')).toHaveTextContent('Udupi');
    expect(screen.getByTestId('breadcrumb-group')).toHaveTextContent('University Belt');
    expect(screen.getByTestId('breadcrumb-area')).toHaveTextContent('Manipal');
  });

  it('marks the area crumb as the current (terminal) page', () => {
    render(<AreaFirstBreadcrumb cityLabel="Udupi" groupName="University Belt" areaLabel="Manipal" />);
    expect(screen.getByTestId('breadcrumb-area')).toHaveAttribute('aria-current', 'page');
  });

  it('omits the group crumb when no group context is present', () => {
    render(<AreaFirstBreadcrumb cityLabel="Udupi" areaLabel="Malpe" />);
    expect(screen.queryByTestId('breadcrumb-group')).not.toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-city')).toHaveTextContent('Udupi');
    expect(screen.getByTestId('breadcrumb-area')).toHaveTextContent('Malpe');
  });

  it('is generic across cities/groups/areas (no hardcoded copy)', () => {
    render(<AreaFirstBreadcrumb cityLabel="Bangalore" groupName="Tech Corridor" areaLabel="Whitefield" />);
    const nav = screen.getByTestId('area-first-breadcrumb');
    expect(nav).toHaveTextContent('Bangalore');
    expect(nav).toHaveTextContent('Tech Corridor');
    expect(nav).toHaveTextContent('Whitefield');
    expect(nav).not.toHaveTextContent('Manipal');
    expect(nav).not.toHaveTextContent('University Belt');
  });

  it('does not use school-first wording', () => {
    render(<AreaFirstBreadcrumb cityLabel="Udupi" groupName="University Belt" areaLabel="Manipal" />);
    expect(screen.getByTestId('area-first-breadcrumb')).not.toHaveTextContent(/Selected school/i);
  });

  it('invokes progressive navigation handlers', () => {
    const onHome = vi.fn();
    const onCity = vi.fn();
    const onGroup = vi.fn();
    render(
      <AreaFirstBreadcrumb
        cityLabel="Udupi"
        groupName="University Belt"
        areaLabel="Manipal"
        onHome={onHome}
        onCity={onCity}
        onGroup={onGroup}
      />,
    );
    fireEvent.click(screen.getByTestId('breadcrumb-home'));
    fireEvent.click(screen.getByTestId('breadcrumb-city'));
    fireEvent.click(screen.getByTestId('breadcrumb-group'));
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(onCity).toHaveBeenCalledTimes(1);
    expect(onGroup).toHaveBeenCalledTimes(1);
  });

  it('disables crumb buttons when no handler is supplied', () => {
    render(<AreaFirstBreadcrumb cityLabel="Udupi" groupName="University Belt" areaLabel="Manipal" />);
    expect(screen.getByTestId('breadcrumb-home')).toBeDisabled();
    expect(screen.getByTestId('breadcrumb-city')).toBeDisabled();
    expect(screen.getByTestId('breadcrumb-group')).toBeDisabled();
  });

  it('renders and navigates the region crumb when regionName is supplied (4-level hierarchy)', () => {
    const onRegion = vi.fn();
    render(
      <AreaFirstBreadcrumb
        cityLabel="Bangalore"
        regionName="North Bangalore"
        groupName="Airport Belt"
        areaLabel="Hebbal"
        onRegion={onRegion}
      />,
    );
    expect(screen.getByTestId('breadcrumb-region')).toHaveTextContent('North Bangalore');
    fireEvent.click(screen.getByTestId('breadcrumb-region'));
    expect(onRegion).toHaveBeenCalledTimes(1);
  });

  // ─── Issue #1953 build step 6 (AC9) — pill-and-chevron restyle ──────────
  it('renders as a single rounded pill container (AC9 pill-and-chevron pattern)', () => {
    render(<AreaFirstBreadcrumb cityLabel="Udupi" groupName="University Belt" areaLabel="Manipal" />);
    const nav = screen.getByTestId('area-first-breadcrumb');
    // Issue #1956 PR-5 (Slice 6, AC5.9): the pill is only unconditionally
    // `rounded-full` at `sm:` and up (desktop, where the AC9 pill-and-chevron
    // design is unchanged); below `sm` it wraps across lines (`rounded-2xl`)
    // so no crumb needs clipping at a true 390px mobile viewport — see the
    // un-clipping describe block below.
    expect(nav).toHaveClass('sm:rounded-full');
    expect(nav).toHaveClass('rounded-2xl');
    expect(nav).toHaveClass('border');
    expect(nav).toHaveClass('bg-card/95');
  });

  it('never renders a cluster-level crumb (no recursive cluster tier exists yet)', () => {
    render(
      <AreaFirstBreadcrumb
        cityLabel="Bangalore"
        regionName="North Bangalore"
        groupName="Airport Belt"
        areaLabel="Hebbal"
      />,
    );
    expect(screen.queryByTestId('breadcrumb-cluster')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/breadcrumb-cluster/)).toHaveLength(0);
  });

  // ─── Issue #1956 PR-5 (Slice 6, AC5.9) — breadcrumb un-clipping ──────────
  // jsdom cannot prove the actual visual reflow (no layout engine — see this
  // PR's [test_strategy].jsdom_cannot_prove) — the REAL-BROWSER proof is
  // e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts. A real 390x844
  // browser measurement showed the original min-w-0 + fixed max-w-* +
  // single-line (nowrap) fix (below) still over-clipped short crumbs
  // (e.g. "Bangalore" shrunk to 36px in a 326px-wide pill with 64px of
  // unused width) — proportional flex-shrink squeezes every crumb once ANY
  // crumb doesn't fit, even ones that would easily fit alone. The corrected
  // fix additionally wraps (`flex-wrap`) below the `sm` breakpoint so the
  // pill grows taller instead of clipping; `sm:flex-nowrap` +
  // `sm:overflow-hidden` restore the exact prior single-line desktop
  // behaviour, where it was already correct (the desktop regression spec,
  // issue-1956-pr5-desktop-breadcrumb-regression.spec.ts, asserts this).
  describe('un-clipping fix (AC5.9) — mobile flex-wrap, desktop single-line unchanged', () => {
    it('the pill container wraps below sm and stays single-line at sm and up', () => {
      render(
        <AreaFirstBreadcrumb
          cityLabel="Bangalore"
          regionName="North Bangalore"
          groupName="Thanisandra-Hennur Belt"
          areaLabel="Thanisandra-Hennur Belt"
        />,
      );
      const nav = screen.getByTestId('area-first-breadcrumb');
      expect(nav).toHaveClass('min-w-0');
      expect(nav).toHaveClass('flex-wrap');
      expect(nav).toHaveClass('sm:flex-nowrap');
      expect(nav).toHaveClass('sm:overflow-hidden');
    });

    it('every variable-length crumb can shrink to its cap at sm and up, and is unclamped below sm (min-w-0 + max-w-full sm:max-w-*)', () => {
      render(
        <AreaFirstBreadcrumb
          cityLabel="Bangalore"
          regionName="North Bangalore"
          groupName="Thanisandra-Hennur Belt"
          areaLabel="Thanisandra-Hennur Belt"
        />,
      );
      for (const testId of ['breadcrumb-city', 'breadcrumb-region', 'breadcrumb-group', 'breadcrumb-area']) {
        const crumb = screen.getByTestId(testId);
        expect(crumb).toHaveClass('min-w-0');
        expect(crumb).toHaveClass('max-w-full');
        expect(crumb).toHaveClass('truncate');
      }
      expect(screen.getByTestId('breadcrumb-city')).toHaveClass('sm:max-w-[120px]');
      expect(screen.getByTestId('breadcrumb-region')).toHaveClass('sm:max-w-[130px]');
      expect(screen.getByTestId('breadcrumb-group')).toHaveClass('sm:max-w-[140px]');
      expect(screen.getByTestId('breadcrumb-area')).toHaveClass('sm:max-w-[140px]');
    });
  });
});

