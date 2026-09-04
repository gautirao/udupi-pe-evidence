import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { CommittedResultScope } from '@/features/discover/state/resultScope';

const { mockCommitResultScope, mockResultScope } = vi.hoisted(() => ({
  mockCommitResultScope: vi.fn(),
  mockResultScope: { current: undefined as CommittedResultScope | undefined },
}));

vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({ resultScope: mockResultScope.current }),
  useDiscoverActions: () => ({ commitResultScope: mockCommitResultScope }),
}));

import { ActiveScopeChip } from './ActiveScopeChip';

const KORAMANGALA: AreaPoint = {
  areaKey: 'koramangala',
  areaLabel: 'Koramangala',
  geo_center_lat: 12.9352,
  geo_center_lon: 77.6142,
  bbox: [
    [12.92, 77.6],
    [12.95, 77.63],
  ],
};

const INDIRANAGAR: AreaPoint = {
  areaKey: 'indiranagar',
  areaLabel: 'Indiranagar',
  geo_center_lat: 12.9719,
  geo_center_lon: 77.6412,
  bbox: [
    [12.96, 77.63],
    [12.98, 77.65],
  ],
};

const OVERVIEW_AREAS: AreaPoint[] = [KORAMANGALA, INDIRANAGAR];

function renderChip(resultScope: CommittedResultScope | undefined, publishCameraIntent = vi.fn()) {
  mockResultScope.current = resultScope;
  mockCommitResultScope.mockClear();
  const { container } = render(
    <ActiveScopeChip discoverAreas={OVERVIEW_AREAS} publishCameraIntent={publishCameraIntent} />,
  );
  return { container, publishCameraIntent };
}

const DRAWN_AREA: [number, number][] = [
  [12.92, 77.6],
  [12.95, 77.6],
  [12.95, 77.63],
];

describe('ActiveScopeChip', () => {
  it('renders nothing when the active scope is AREA_SET', () => {
    const { container } = renderChip({
      active: { kind: 'AREA_SET', areaKeys: ['koramangala'] },
      previous: null,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no committed scope at all', () => {
    const { container } = renderChip({ active: null, previous: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('interpolates the single previous area name into the Return label (single-area AREA_SET)', () => {
    renderChip({
      active: { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.6, n: 13.0, e: 77.7 } },
      previous: { kind: 'AREA_SET', areaKeys: ['koramangala'] },
    });

    expect(screen.getByRole('button', { name: /return to koramangala/i })).toBeInTheDocument();
  });

  it('interpolates all previous area names into the Return label (multi-area AREA_SET)', () => {
    renderChip({
      active: { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.6, n: 13.0, e: 77.7 } },
      previous: { kind: 'AREA_SET', areaKeys: ['koramangala', 'indiranagar'] },
    });

    expect(
      screen.getByRole('button', { name: /return to koramangala, indiranagar/i }),
    ).toBeInTheDocument();
  });

  it('shows a generic-but-honest label for a POLYGON previous scope', () => {
    renderChip({
      active: { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.6, n: 13.0, e: 77.7 } },
      previous: { kind: 'POLYGON', coordinates: [[12.9, 77.6], [13.0, 77.7]] },
    });

    expect(screen.getByRole('button', { name: /return to previous search area/i })).toBeInTheDocument();
  });

  it('commits the previous scope and restores the camera to the single previous area on click', async () => {
    const user = userEvent.setup();
    const { publishCameraIntent } = renderChip({
      active: { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.6, n: 13.0, e: 77.7 } },
      previous: { kind: 'AREA_SET', areaKeys: ['koramangala'] },
    });

    await user.click(screen.getByRole('button', { name: /return to koramangala/i }));

    expect(mockCommitResultScope).toHaveBeenCalledTimes(1);
    expect(mockCommitResultScope).toHaveBeenCalledWith({ kind: 'AREA_SET', areaKeys: ['koramangala'] });
    expect(publishCameraIntent).toHaveBeenCalledTimes(1);
    expect(publishCameraIntent).toHaveBeenCalledWith(KORAMANGALA);
  });

  it('commits the previous scope and restores the camera to the union bounds for a multi-area previous scope', async () => {
    const user = userEvent.setup();
    const { publishCameraIntent } = renderChip({
      active: { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.6, n: 13.0, e: 77.7 } },
      previous: { kind: 'AREA_SET', areaKeys: ['koramangala', 'indiranagar'] },
    });

    await user.click(screen.getByRole('button', { name: /return to koramangala, indiranagar/i }));

    expect(mockCommitResultScope).toHaveBeenCalledTimes(1);
    expect(publishCameraIntent).toHaveBeenCalledTimes(1);
    const [cameraTarget] = publishCameraIntent.mock.calls[0] as [AreaPoint];
    expect(cameraTarget.bbox).toEqual([
      [12.92, 77.6],
      [12.98, 77.65],
    ]);
  });
});

/**
 * Issue #2419 (PR-1) — the committed-POLYGON branch. Before this issue a
 * committed POLYGON rendered no chip here at all.
 */
describe('ActiveScopeChip — committed POLYGON scope', () => {
  it('names the scope "Drawn area", matching the design kit vocabulary', () => {
    renderChip({ active: { kind: 'POLYGON', coordinates: DRAWN_AREA }, previous: null });

    expect(screen.getByTestId('active-scope-chip-polygon')).toHaveTextContent('Drawn area');
    // Not the retired MapStatsBar wording, which called the same state
    // something different in a second place.
    expect(screen.queryByText(/area search/i)).not.toBeInTheDocument();
  });

  it('offers "Return to <previous areas>" for a POLYGON that replaced an AREA_SET', () => {
    renderChip({
      active: { kind: 'POLYGON', coordinates: DRAWN_AREA },
      previous: { kind: 'AREA_SET', areaKeys: ['koramangala', 'indiranagar'] },
    });

    expect(
      screen.getByRole('button', { name: /return to koramangala, indiranagar/i }),
    ).toBeInTheDocument();
  });

  // #2016: the prior scope is restored BY NAME from `previous`, never
  // re-derived from wherever the camera happens to be.
  it('restores the previous AREA_SET by name and re-fits the camera to it', async () => {
    const user = userEvent.setup();
    const { publishCameraIntent } = renderChip({
      active: { kind: 'POLYGON', coordinates: DRAWN_AREA },
      previous: { kind: 'AREA_SET', areaKeys: ['koramangala'] },
    });

    await user.click(screen.getByRole('button', { name: /return to koramangala/i }));

    expect(mockCommitResultScope).toHaveBeenCalledTimes(1);
    expect(mockCommitResultScope).toHaveBeenCalledWith({
      kind: 'AREA_SET',
      areaKeys: ['koramangala'],
    });
    expect(publishCameraIntent).toHaveBeenCalledWith(KORAMANGALA);
  });

  // A first-ever polygon has nothing to go back to. Offering "Return" there
  // would be a control that cannot do anything.
  it('omits the return action when the polygon replaced nothing', () => {
    renderChip({ active: { kind: 'POLYGON', coordinates: DRAWN_AREA }, previous: null });

    expect(screen.getByTestId('active-scope-chip-polygon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /return/i })).not.toBeInTheDocument();
  });

  // PR-1 deliberately ships no Redraw: nothing can enter draw mode yet.
  it('does not offer a Redraw or Edit boundary action in PR-1', () => {
    renderChip({
      active: { kind: 'POLYGON', coordinates: DRAWN_AREA },
      previous: { kind: 'AREA_SET', areaKeys: ['koramangala'] },
    });

    expect(screen.queryByRole('button', { name: /redraw|edit boundary/i })).not.toBeInTheDocument();
  });

  it('keeps the VIEWPORT chip on its own testid and wording', () => {
    renderChip({
      active: { kind: 'VIEWPORT', bounds: { s: 12.9, w: 77.6, n: 13.0, e: 77.7 } },
      previous: null,
    });

    expect(screen.getByTestId('active-scope-chip-viewport')).toHaveTextContent('Visible map area');
    expect(screen.queryByTestId('active-scope-chip-polygon')).not.toBeInTheDocument();
  });
});
