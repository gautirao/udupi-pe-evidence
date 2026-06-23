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
});
