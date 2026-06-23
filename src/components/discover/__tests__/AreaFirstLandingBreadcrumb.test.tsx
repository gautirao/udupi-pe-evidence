import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AreaFirstLandingBreadcrumb } from '../AreaFirstLandingBreadcrumb';

/**
 * Issue #1607 — the area-first city-level landing breadcrumb reads
 * "Home › {City} › Areas", with Home and the city crumb routing progressively
 * and "Areas" as the terminal (current) page.
 */
const renderCrumb = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('AreaFirstLandingBreadcrumb', () => {
  it('renders the Home › City › Areas trail', () => {
    renderCrumb(
      <AreaFirstLandingBreadcrumb cityLabel="Udupi" cityHref="/discover?city=udupi" />,
    );
    const nav = screen.getByTestId('area-first-landing-breadcrumb');
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Udupi')).toBeInTheDocument();
    expect(screen.getByText('Areas')).toBeInTheDocument();
  });

  it('routes Home to "/" and the city crumb to the city-level discover landing', () => {
    renderCrumb(
      <AreaFirstLandingBreadcrumb cityLabel="Udupi" cityHref="/discover?city=udupi" />,
    );
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Udupi').closest('a')).toHaveAttribute(
      'href',
      '/discover?city=udupi',
    );
  });

  it('marks "Areas" as the current page and never links it', () => {
    renderCrumb(
      <AreaFirstLandingBreadcrumb cityLabel="Mangalore" cityHref="/discover?city=mangalore" />,
    );
    const terminal = screen.getByText('Areas');
    expect(terminal).toHaveAttribute('aria-current', 'page');
    expect(terminal.closest('a')).toBeNull();
  });

  it('honours a custom homeHref', () => {
    renderCrumb(
      <AreaFirstLandingBreadcrumb
        cityLabel="Udupi"
        cityHref="/discover?city=udupi"
        homeHref="/home"
      />,
    );
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/home');
  });
});
