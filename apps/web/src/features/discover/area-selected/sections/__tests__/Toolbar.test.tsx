import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Toolbar } from '../Toolbar';

const renderToolbar = (props: Partial<React.ComponentProps<typeof Toolbar>> = {}) =>
  render(
    <MemoryRouter>
      <Toolbar cityLabel="Udupi" {...props} />
    </MemoryRouter>,
  );

describe('#2658 C3 — Toolbar', () => {
  it('renders the Area-first pill only for the area-first journey', () => {
    renderToolbar({ journey: 'area-first' });
    expect(screen.getByText('Area-first')).toBeInTheDocument();
  });

  it('omits the Area-first pill for a different journey', () => {
    renderToolbar({ journey: 'school-first' });
    expect(screen.queryByText('Area-first')).not.toBeInTheDocument();
  });

  it('renders a Trends link only when trendsHref is supplied', () => {
    const { rerender } = renderToolbar();
    expect(screen.queryByText('Trends')).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <Toolbar cityLabel="Udupi" trendsHref="/trends/udupi" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Trends').closest('a')).toHaveAttribute('href', '/trends/udupi');
  });

  it('renders the Back button only when onBack is supplied, and calls it on click', () => {
    const onBack = vi.fn();
    renderToolbar({ onBack });
    fireEvent.click(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits the Back button when onBack is absent', () => {
    renderToolbar();
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
  });

  it('renders Start over only when both journey and onStartOver are supplied', () => {
    const { rerender } = renderToolbar({ journey: 'area-first' });
    expect(screen.queryByText(/start over/i)).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <Toolbar cityLabel="Udupi" journey="area-first" onStartOver={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/start over/i)).toBeInTheDocument();
  });
});
