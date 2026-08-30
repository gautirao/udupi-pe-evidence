import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { EmptyState } from '../EmptyState';

const icon = <MapPin className="h-8 w-8 text-muted-foreground/40" />;

const renderEmptyState = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('EmptyState', () => {
  it('renders heading and description', () => {
    renderEmptyState(
      <EmptyState
        icon={icon}
        heading="No results found"
        description="Try adjusting your filters"
      />,
    );
    expect(screen.getByRole('heading', { name: 'No results found' })).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
  });

  it('omits description when not provided', () => {
    renderEmptyState(<EmptyState icon={icon} heading="Nothing here" />);
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-description')).not.toBeInTheDocument();
  });

  it('renders primary action button when provided', () => {
    renderEmptyState(
      <EmptyState
        icon={icon}
        heading="Empty"
        primaryAction={{ label: 'Go Home', onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Go Home' })).toBeInTheDocument();
  });

  it('fires onClick when primary action button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderEmptyState(
      <EmptyState
        icon={icon}
        heading="Empty"
        primaryAction={{ label: 'Retry', onClick }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders primary action as anchor link when href is provided', () => {
    renderEmptyState(
      <EmptyState
        icon={icon}
        heading="City not supported"
        primaryAction={{ label: 'Explore Udupi', href: '/discover?city=udupi' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Explore Udupi' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/discover?city=udupi');
  });

  it('omits action buttons when neither primaryAction nor secondaryAction is provided', () => {
    renderEmptyState(<EmptyState icon={icon} heading="Empty" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders secondaryAction button alongside primary', () => {
    renderEmptyState(
      <EmptyState
        icon={icon}
        heading="Empty"
        primaryAction={{ label: 'Primary', onClick: vi.fn() }}
        secondaryAction={{ label: 'Secondary', onClick: vi.fn() }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
  });

  it('renders children below the action buttons', () => {
    renderEmptyState(
      <EmptyState
        icon={icon}
        heading="Empty"
        primaryAction={{ label: 'Primary', onClick: vi.fn() }}
      >
        <div data-testid="child-content">extra content</div>
      </EmptyState>,
    );
    const child = screen.getByTestId('child-content');
    expect(child).toBeInTheDocument();

    // Assert children appear after the actions block in the DOM.
    // Node.DOCUMENT_POSITION_FOLLOWING (4) means `child` comes after the action button.
    const actionButton = screen.getByRole('button', { name: 'Primary' });
    const position = actionButton.compareDocumentPosition(child);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('applies sm size container class when size="sm"', () => {
    const { container } = renderEmptyState(
      <EmptyState icon={icon} heading="Small" size="sm" />,
    );
    const iconContainer = container.querySelector('.w-10.h-10');
    expect(iconContainer).toBeInTheDocument();
  });

  it('applies md size container class by default', () => {
    const { container } = renderEmptyState(
      <EmptyState icon={icon} heading="Default" />,
    );
    const iconContainer = container.querySelector('.w-16.h-16');
    expect(iconContainer).toBeInTheDocument();
  });
});
