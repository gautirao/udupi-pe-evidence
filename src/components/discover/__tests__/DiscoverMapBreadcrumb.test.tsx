/**
 * Tests for DiscoverMapBreadcrumb (Issue #1745 P4)
 *
 * Consolidates the three previously-separate MAP-OVERLAY pills — MapGroupBreadcrumb
 * (#1595/#1606), AreaFirstLandingBreadcrumb (#1607), and SchoolJourneyBreadcrumb
 * (school-radius overlay) — into one shared, behaviour+visual-preserving shell. These
 * cases migrate the assertions from the three deleted/trimmed suites plus new coverage
 * for the generic props (density, emphasis, containerClassName/separatorClassName
 * overrides) that make the consolidation possible.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MapPin, GraduationCap } from 'lucide-react';
import { DiscoverMapBreadcrumb, type DiscoverMapCrumb } from '../DiscoverMapBreadcrumb';

const UUID = '23a61c72-1e6a-4499-8eac-9e3eaff55768';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const renderCrumb = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

// ── Config 1: area-first landing ("Home › City › Areas", Link-based) ──────────────────

describe('DiscoverMapBreadcrumb — area-first landing config', () => {
  const landingSegments: DiscoverMapCrumb[] = [
    { key: 'home', label: 'Home', href: '/' },
    { key: 'city', label: 'Udupi', href: '/discover?city=udupi', maxWidthClass: 'max-w-[140px]' },
    { key: 'areas', label: 'Areas', current: true, emphasis: 'strong' },
  ];

  it('renders the Home › City › Areas trail', () => {
    renderCrumb(
      <DiscoverMapBreadcrumb
        testId="area-first-landing-breadcrumb"
        leadingIcon={MapPin}
        leadingIconClassName="text-[hsl(var(--copper))]"
        segments={landingSegments}
      />,
    );
    const nav = screen.getByTestId('area-first-landing-breadcrumb');
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Udupi')).toBeInTheDocument();
    expect(screen.getByText('Areas')).toBeInTheDocument();
  });

  it('routes Home and City hrefs verbatim (href → Link)', () => {
    renderCrumb(
      <DiscoverMapBreadcrumb
        testId="area-first-landing-breadcrumb"
        leadingIcon={MapPin}
        segments={landingSegments}
      />,
    );
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Udupi').closest('a')).toHaveAttribute(
      'href',
      '/discover?city=udupi',
    );
  });

  it('marks the terminal "Areas" crumb current and never links it', () => {
    renderCrumb(
      <DiscoverMapBreadcrumb
        testId="area-first-landing-breadcrumb"
        leadingIcon={MapPin}
        segments={landingSegments}
      />,
    );
    const terminal = screen.getByText('Areas');
    expect(terminal).toHaveAttribute('aria-current', 'page');
    expect(terminal.closest('a')).toBeNull();
  });

  it('applies the per-segment maxWidthClass to the City link', () => {
    renderCrumb(
      <DiscoverMapBreadcrumb
        testId="area-first-landing-breadcrumb"
        leadingIcon={MapPin}
        segments={landingSegments}
      />,
    );
    expect(screen.getByText('Udupi').closest('a')).toHaveClass('max-w-[140px]', 'truncate');
  });

  it('honours a custom homeHref built by the caller', () => {
    renderCrumb(
      <DiscoverMapBreadcrumb
        testId="area-first-landing-breadcrumb"
        leadingIcon={MapPin}
        segments={[
          { key: 'home', label: 'Home', href: '/home' },
          { key: 'city', label: 'Udupi', href: '/discover?city=udupi' },
          { key: 'areas', label: 'Areas', current: true, emphasis: 'strong' },
        ]}
      />,
    );
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/home');
  });

  it('applies the leading icon colour class', () => {
    renderCrumb(
      <DiscoverMapBreadcrumb
        testId="area-first-landing-breadcrumb"
        leadingIcon={MapPin}
        leadingIconClassName="text-[hsl(var(--copper))]"
        segments={landingSegments}
      />,
    );
    const icon = screen.getByTestId('area-first-landing-breadcrumb').querySelector('svg');
    expect(icon).toHaveClass('text-[hsl(var(--copper))]', 'h-3.5', 'w-3.5');
  });
});

// ── Config 2: MapGroupBreadcrumb (City › Group[ › Area], span-based) ──────────────────

describe('DiscoverMapBreadcrumb — map-group config (no area)', () => {
  it('renders the city and group as a breadcrumb, group bold (no area = terminal)', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="map-group-breadcrumb"
        leadingIcon={MapPin}
        segments={[
          { key: 'city', label: 'Udupi' },
          { key: 'group', label: 'University Belt', maxWidthClass: 'max-w-[160px]', emphasis: 'strong' },
        ]}
      />,
    );
    const nav = screen.getByTestId('map-group-breadcrumb');
    expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
    expect(nav).toHaveTextContent('Udupi');
    expect(nav).toHaveTextContent('University Belt');
    expect(screen.getByText('University Belt')).toHaveClass('font-semibold', 'text-foreground');
  });

  it('is generic across cities and groups (no hardcoded copy)', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="map-group-breadcrumb"
        leadingIcon={MapPin}
        segments={[
          { key: 'city', label: 'Bangalore' },
          { key: 'group', label: 'Tech Corridor', maxWidthClass: 'max-w-[160px]', emphasis: 'strong' },
        ]}
      />,
    );
    const nav = screen.getByTestId('map-group-breadcrumb');
    expect(nav).toHaveTextContent('Bangalore');
    expect(nav).toHaveTextContent('Tech Corridor');
    expect(nav).not.toHaveTextContent('Udupi');
  });
});

describe('DiscoverMapBreadcrumb — map-group config (with area)', () => {
  it('appends the area segment as bold-terminal, demoting the group to muted', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="map-group-breadcrumb"
        leadingIcon={MapPin}
        segments={[
          { key: 'city', label: 'Udupi' },
          { key: 'group', label: 'University Belt', maxWidthClass: 'max-w-[160px]', emphasis: 'muted' },
          { key: 'area', label: 'Manipal', maxWidthClass: 'max-w-[160px]', emphasis: 'strong' },
        ]}
      />,
    );
    const nav = screen.getByTestId('map-group-breadcrumb');
    expect(nav).toHaveTextContent('Udupi');
    expect(nav).toHaveTextContent('University Belt');
    expect(nav).toHaveTextContent('Manipal');
    expect(screen.getByText('University Belt')).toHaveClass('text-muted-foreground');
    expect(screen.getByText('Manipal')).toHaveClass('font-semibold', 'text-foreground');
  });
});

// ── Config 3: SchoolJourneyBreadcrumb (compact density, plum school segment) ──────────

describe('DiscoverMapBreadcrumb — school-journey config', () => {
  const fullSegments: DiscoverMapCrumb[] = [
    { key: 'city', label: 'Udupi' },
    { key: 'zone', label: 'University Belt' },
    { key: 'area', label: 'Manipal' },
    { key: 'school', label: 'Little Flower English Medium School', emphasis: 'school', maxWidthClass: 'max-w-[180px]' },
  ];

  it('renders the full resolved journey City > Zone > Area > School', () => {
    render(
      <DiscoverMapBreadcrumb
        ariaLabel="Journey breadcrumb"
        testId="school-journey-breadcrumb"
        density="compact"
        separatorClassName="text-muted-foreground/50"
        leadingIcon={GraduationCap}
        leadingIconClassName="text-[hsl(var(--plum))]"
        segments={fullSegments}
      />,
    );
    expect(screen.getByTestId('breadcrumb-seg-city')).toHaveTextContent('Udupi');
    expect(screen.getByTestId('breadcrumb-seg-zone')).toHaveTextContent('University Belt');
    expect(screen.getByTestId('breadcrumb-seg-area')).toHaveTextContent('Manipal');
    expect(screen.getByTestId('breadcrumb-seg-school')).toHaveTextContent(
      'Little Flower English Medium School',
    );
  });

  it('the school segment is plum + semibold + max-w-[180px] (emphasis="school")', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="school-journey-breadcrumb"
        density="compact"
        leadingIcon={GraduationCap}
        segments={fullSegments}
      />,
    );
    expect(screen.getByTestId('breadcrumb-seg-school')).toHaveClass(
      'font-semibold',
      'text-[hsl(var(--plum))]',
      'max-w-[180px]',
    );
  });

  it('omits missing segments gracefully (no zone, no school yet) without "undefined"', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="school-journey-breadcrumb"
        density="compact"
        leadingIcon={GraduationCap}
        segments={[
          { key: 'city', label: 'Udupi' },
          { key: 'area', label: 'Manipal' },
        ]}
      />,
    );
    expect(screen.getByTestId('breadcrumb-seg-city')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-seg-area')).toBeInTheDocument();
    expect(screen.queryByTestId('breadcrumb-seg-zone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('breadcrumb-seg-school')).not.toBeInTheDocument();
    const nav = screen.getByTestId('school-journey-breadcrumb');
    expect(nav.textContent).not.toMatch(/undefined|null/);
  });

  it('shows the breadcrumb without the school segment while the school is still loading', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="school-journey-breadcrumb"
        density="compact"
        leadingIcon={GraduationCap}
        segments={[
          { key: 'city', label: 'Udupi' },
          { key: 'zone', label: 'University Belt' },
          { key: 'area', label: 'Manipal' },
        ]}
      />,
    );
    expect(screen.getByTestId('breadcrumb-seg-area')).toHaveTextContent('Manipal');
    expect(screen.queryByTestId('breadcrumb-seg-school')).not.toBeInTheDocument();
  });

  it('never renders a raw UUID — only resolved names', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="school-journey-breadcrumb"
        density="compact"
        leadingIcon={GraduationCap}
        segments={fullSegments}
      />,
    );
    expect(screen.getByTestId('school-journey-breadcrumb').textContent).not.toMatch(UUID_RE);
  });

  it('renders exactly the label it is given (does not synthesize ids)', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="school-journey-breadcrumb"
        density="compact"
        leadingIcon={GraduationCap}
        segments={[
          { key: 'city', label: 'Udupi' },
          { key: 'school', label: 'Dr TMA Pai Composite PU College', emphasis: 'school' },
        ]}
      />,
    );
    expect(screen.getByTestId('school-journey-breadcrumb').textContent).not.toContain(UUID);
  });

  it('returns null when there are no segments (nothing resolved yet)', () => {
    const { container } = render(
      <DiscoverMapBreadcrumb testId="school-journey-breadcrumb" leadingIcon={GraduationCap} segments={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ── Generic shell behaviour (density, emphasis, overrides) ────────────────────────────

describe('DiscoverMapBreadcrumb — generic shell behaviour', () => {
  it('default density uses text-[13px] and h-3.5 chevrons', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="pill"
        leadingIcon={MapPin}
        segments={[
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ]}
      />,
    );
    const nav = screen.getByTestId('pill');
    expect(nav).toHaveClass('text-[13px]');
    const chevron = nav.querySelectorAll('svg')[1];
    expect(chevron).toHaveClass('h-3.5', 'w-3.5');
  });

  it('compact density uses text-xs and h-3 chevrons', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="pill"
        density="compact"
        leadingIcon={MapPin}
        segments={[
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ]}
      />,
    );
    const nav = screen.getByTestId('pill');
    expect(nav).toHaveClass('text-xs');
    const chevron = nav.querySelectorAll('svg')[1];
    expect(chevron).toHaveClass('h-3', 'w-3');
  });

  it('emphasis "muted" applies text-muted-foreground', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="pill"
        leadingIcon={MapPin}
        segments={[{ key: 'a', label: 'Ancestor', emphasis: 'muted' }]}
      />,
    );
    expect(screen.getByText('Ancestor')).toHaveClass('text-muted-foreground');
  });

  it('emphasis "strong" applies font-semibold text-foreground', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="pill"
        leadingIcon={MapPin}
        segments={[{ key: 'a', label: 'Current', emphasis: 'strong' }]}
      />,
    );
    expect(screen.getByText('Current')).toHaveClass('font-semibold', 'text-foreground');
  });

  it('emphasis "school" applies font-semibold text-[hsl(var(--plum))]', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="pill"
        leadingIcon={MapPin}
        segments={[{ key: 'a', label: 'School', emphasis: 'school' }]}
      />,
    );
    expect(screen.getByText('School')).toHaveClass('font-semibold', 'text-[hsl(var(--plum))]');
  });

  it('returns null when segments is empty', () => {
    const { container } = render(
      <DiscoverMapBreadcrumb testId="pill" leadingIcon={MapPin} segments={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('containerClassName merges via twMerge — an overriding shadow wins over the base shadow-sm', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="pill"
        leadingIcon={MapPin}
        containerClassName="shadow-md"
        segments={[{ key: 'a', label: 'A' }]}
      />,
    );
    const nav = screen.getByTestId('pill');
    expect(nav).toHaveClass('shadow-md');
    expect(nav).not.toHaveClass('shadow-sm');
  });

  it('separatorClassName overrides the default chevron colour', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="pill"
        leadingIcon={MapPin}
        separatorClassName="text-muted-foreground/50"
        segments={[
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
        ]}
      />,
    );
    const nav = screen.getByTestId('pill');
    const chevron = nav.querySelectorAll('svg')[1];
    expect(chevron).toHaveClass('text-muted-foreground/50');
    expect(chevron).not.toHaveClass('text-muted-foreground/60');
  });

  it('applies a per-segment maxWidthClass with truncate', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="pill"
        leadingIcon={MapPin}
        segments={[{ key: 'a', label: 'A', maxWidthClass: 'max-w-[160px]' }]}
      />,
    );
    expect(screen.getByText('A')).toHaveClass('max-w-[160px]', 'truncate');
  });

  it('applies truncate unconditionally, even without a maxWidthClass (span segment)', () => {
    render(
      <DiscoverMapBreadcrumb
        testId="pill"
        leadingIcon={MapPin}
        segments={[{ key: 'a', label: 'No Max Width' }]}
      />,
    );
    expect(screen.getByText('No Max Width')).toHaveClass('truncate');
  });

  it('applies truncate unconditionally, even without a maxWidthClass (Link segment)', () => {
    renderCrumb(
      <DiscoverMapBreadcrumb
        testId="pill"
        leadingIcon={MapPin}
        segments={[{ key: 'a', label: 'No Max Width Link', href: '/somewhere' }]}
      />,
    );
    expect(screen.getByText('No Max Width Link').closest('a')).toHaveClass('truncate');
  });
});
