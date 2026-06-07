import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock react-leaflet to avoid JSDOM/canvas errors
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
}));

// Mock DrawControl at component boundary to avoid leaflet-draw JSDOM errors
vi.mock('@/components/map/DrawControl', () => ({
  DrawControl: ({
    onPolygonDrawn,
    onPolygonCleared,
  }: {
    onPolygonDrawn: (p: [number, number][]) => void;
    onPolygonCleared: () => void;
  }) => (
    <div data-testid="draw-control">
      <button
        data-testid="simulate-draw-3pts"
        onClick={() =>
          onPolygonDrawn([
            [13.0, 74.0],
            [13.0, 74.1],
            [13.1, 74.1],
          ])
        }
      >
        Simulate Draw (3 pts)
      </button>
      <button
        data-testid="simulate-draw-2pts"
        onClick={() => onPolygonDrawn([[13.0, 74.0], [13.0, 74.1]])}
      >
        Simulate Draw (2 pts)
      </button>
      <button data-testid="simulate-clear" onClick={onPolygonCleared}>
        Simulate Clear
      </button>
    </div>
  ),
}));

// ── Component under test ───────────────────────────────────────────────────────

import { BoundaryDrawStep } from './BoundaryDrawStep';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [13.3442, 74.7451];

function renderStep(
  overrides: Partial<{
    initialCoords: [number, number][];
    center: [number, number];
    onSave: ReturnType<typeof vi.fn>;
    onSkip: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const onSave = overrides.onSave ?? vi.fn();
  const onSkip = overrides.onSkip ?? vi.fn();
  const result = render(
    <BoundaryDrawStep
      initialCoords={overrides.initialCoords ?? []}
      center={overrides.center ?? DEFAULT_CENTER}
      onSave={onSave}
      onSkip={onSkip}
    />,
  );
  return { ...result, onSave, onSkip };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BoundaryDrawStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the disclaimer text in all states', () => {
    renderStep();
    expect(screen.getByTestId('boundary-disclaimer')).toBeInTheDocument();
    expect(
      screen.getByText(/The boundary drawn on the map is approximate/i),
    ).toBeInTheDocument();
  });

  it('shows guidance text in empty state', () => {
    renderStep();
    expect(screen.getByTestId('boundary-guidance-empty')).toBeInTheDocument();
    expect(
      screen.getByText(/Draw the plot boundary on the map below/i),
    ).toBeInTheDocument();
  });

  it('save button is disabled when no coords drawn (empty state)', () => {
    renderStep();
    expect(screen.getByTestId('boundary-save-btn')).toBeDisabled();
  });

  it('save button is disabled with <3 pts drawn', () => {
    renderStep();
    fireEvent.click(screen.getByTestId('simulate-draw-2pts'));
    expect(screen.getByTestId('boundary-save-btn')).toBeDisabled();
  });

  it('shows in-progress hint when <3 pts drawn', () => {
    renderStep();
    fireEvent.click(screen.getByTestId('simulate-draw-2pts'));
    expect(screen.getByTestId('boundary-guidance-in-progress')).toBeInTheDocument();
    expect(
      screen.getByText(/Add at least 3 points to save a boundary/i),
    ).toBeInTheDocument();
  });

  it('save button is enabled after valid draw (>=3 pts)', () => {
    renderStep();
    fireEvent.click(screen.getByTestId('simulate-draw-3pts'));
    expect(screen.getByTestId('boundary-save-btn')).not.toBeDisabled();
  });

  it('shows "Boundary ready" indicator after valid draw', () => {
    renderStep();
    fireEvent.click(screen.getByTestId('simulate-draw-3pts'));
    expect(screen.getByTestId('boundary-ready-indicator')).toBeInTheDocument();
    expect(screen.getByText('Boundary ready')).toBeInTheDocument();
  });

  it('shows clear button after any coords drawn', () => {
    renderStep();
    expect(screen.queryByTestId('boundary-clear-btn')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('simulate-draw-3pts'));
    expect(screen.getByTestId('boundary-clear-btn')).toBeInTheDocument();
  });

  it('clicking Clear returns to empty state (save disabled again)', () => {
    renderStep();
    // Draw a valid polygon
    fireEvent.click(screen.getByTestId('simulate-draw-3pts'));
    expect(screen.getByTestId('boundary-save-btn')).not.toBeDisabled();

    // Clear it
    fireEvent.click(screen.getByTestId('boundary-clear-btn'));

    // Back to empty — save disabled, guidance text visible, clear gone
    expect(screen.getByTestId('boundary-save-btn')).toBeDisabled();
    expect(screen.getByTestId('boundary-guidance-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('boundary-clear-btn')).not.toBeInTheDocument();
  });

  it('onSave called with drawn coords when Save clicked', () => {
    const { onSave } = renderStep();
    fireEvent.click(screen.getByTestId('simulate-draw-3pts'));
    fireEvent.click(screen.getByTestId('boundary-save-btn'));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith([
      [13.0, 74.0],
      [13.0, 74.1],
      [13.1, 74.1],
    ]);
  });

  it('onSkip called when Skip clicked', () => {
    const { onSkip } = renderStep();
    fireEvent.click(screen.getByTestId('boundary-skip-btn'));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('skip button is always enabled regardless of drawn state', () => {
    renderStep();
    expect(screen.getByTestId('boundary-skip-btn')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('simulate-draw-3pts'));
    expect(screen.getByTestId('boundary-skip-btn')).not.toBeDisabled();
  });

  it('pre-populates from initialCoords and shows valid state immediately', () => {
    renderStep({
      initialCoords: [
        [13.0, 74.0],
        [13.0, 74.1],
        [13.1, 74.1],
      ],
    });
    expect(screen.getByTestId('boundary-save-btn')).not.toBeDisabled();
    expect(screen.getByTestId('boundary-ready-indicator')).toBeInTheDocument();
  });

  it('renders map container', () => {
    renderStep();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('clears drawn boundary when DrawControl fires onPolygonCleared', () => {
    renderStep();
    // Draw a valid polygon first
    fireEvent.click(screen.getByTestId('simulate-draw-3pts'));
    expect(screen.getByTestId('boundary-save-btn')).not.toBeDisabled();
    // Simulate DrawControl emitting onPolygonCleared (e.g. user clicks leaflet-draw trash)
    fireEvent.click(screen.getByTestId('simulate-clear'));
    // Save button should be disabled again — back to empty state
    expect(screen.getByTestId('boundary-save-btn')).toBeDisabled();
    expect(screen.getByTestId('boundary-guidance-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('boundary-clear-btn')).not.toBeInTheDocument();
  });
});
