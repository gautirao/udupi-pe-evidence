import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumb } from '../Breadcrumb';

const renderBreadcrumb = (props: Partial<React.ComponentProps<typeof Breadcrumb>> = {}) =>
  render(<Breadcrumb cityLabel="Udupi" areaLabel="Kalsanka" {...props} />);

describe('#2658 C3 — Breadcrumb', () => {
  it('renders the city and area labels', () => {
    renderBreadcrumb();
    expect(screen.getByText('Udupi')).toBeInTheDocument();
    expect(screen.getByText('Kalsanka')).toBeInTheDocument();
  });

  it('calls onHome when the Home crumb is clicked', () => {
    const onHome = vi.fn();
    renderBreadcrumb({ onHome });
    fireEvent.click(screen.getByText(/home/i));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('renders the region/group crumbs only when supplied', () => {
    const { rerender } = renderBreadcrumb();
    expect(screen.queryByText('Coastal Karnataka')).not.toBeInTheDocument();

    rerender(
      <Breadcrumb cityLabel="Udupi" areaLabel="Kalsanka" regionName="Coastal Karnataka" groupName="North Group" />,
    );
    expect(screen.getByText('Coastal Karnataka')).toBeInTheDocument();
    expect(screen.getByText('North Group')).toBeInTheDocument();
  });
});
