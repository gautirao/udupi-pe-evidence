import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkflowGroup } from '../WorkflowGroup';

describe('#2658 C3 — WorkflowGroup', () => {
  it('renders nothing when neither onSearchChange nor areaRecommendationTiles is supplied', () => {
    const { container } = render(<WorkflowGroup areaLabel="Kalsanka" searchQuery="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the search box when onSearchChange is supplied, with the area-specific placeholder', () => {
    render(<WorkflowGroup areaLabel="Kalsanka" searchQuery="" onSearchChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search properties in Kalsanka')).toBeInTheDocument();
  });

  it('calls onSearchChange with the typed value', () => {
    const onSearchChange = vi.fn();
    render(<WorkflowGroup areaLabel="Kalsanka" searchQuery="" onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByTestId('area-search-input'), { target: { value: 'villa' } });
    expect(onSearchChange).toHaveBeenCalledWith('villa');
  });

  it('shows a clear button only when searchQuery is non-empty, and clears via onSearchChange("")', () => {
    const onSearchChange = vi.fn();
    const { rerender } = render(<WorkflowGroup areaLabel="Kalsanka" searchQuery="" onSearchChange={onSearchChange} />);
    expect(screen.queryByTestId('area-search-clear')).not.toBeInTheDocument();

    rerender(<WorkflowGroup areaLabel="Kalsanka" searchQuery="villa" onSearchChange={onSearchChange} />);
    fireEvent.click(screen.getByTestId('area-search-clear'));
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('renders areaRecommendationTiles even without a search handler', () => {
    render(
      <WorkflowGroup areaLabel="Kalsanka" searchQuery="" areaRecommendationTiles={<span>tiles-content</span>} />,
    );
    expect(screen.getByText('tiles-content')).toBeInTheDocument();
    expect(screen.queryByTestId('area-search-input')).not.toBeInTheDocument();
  });
});
