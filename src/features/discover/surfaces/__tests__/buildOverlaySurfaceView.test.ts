import { describe, expect, it, vi } from 'vitest';
import {
  buildOverlaySurfaceView,
  buildOverlaySurfaceCommands,
  type BuildOverlaySurfaceViewParams,
  type BuildOverlaySurfaceCommandsParams,
} from '../buildOverlaySurfaceView';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { DiscoverJourneyTransitionsCommands } from '@/features/discover/state/useDiscoverJourneyTransitions';

function makeFilters(overrides: Partial<PropertyFilters> = {}): PropertyFilters {
  return { schoolRadiusKm: 5, ...overrides } as PropertyFilters;
}

function makeViewParams(
  overrides: Partial<BuildOverlaySurfaceViewParams> = {},
): BuildOverlaySurfaceViewParams {
  return {
    isAgriJourney: false,
    nearSchoolOpen: true,
    selectedSchool: null,
    filters: makeFilters(),
    schoolBoardFilter: ['CBSE'],
    isCityValid: true,
    city: 'bangalore',
    ...overrides,
  };
}

describe('buildOverlaySurfaceView', () => {
  it('marks nearSchool visible when not an agri journey and passes through fields verbatim', () => {
    const school: SchoolResult = { id: 'sch-1' } as SchoolResult;
    const view = buildOverlaySurfaceView(
      makeViewParams({ selectedSchool: school, nearSchoolOpen: false }),
    );
    expect(view.nearSchool.visible).toBe(true);
    expect(view.nearSchool.open).toBe(false);
    expect(view.nearSchool.selectedSchool).toBe(school);
    expect(view.nearSchool.boardFilter).toEqual(['CBSE']);
  });

  it('hides nearSchool during the agri-first journey', () => {
    const view = buildOverlaySurfaceView(makeViewParams({ isAgriJourney: true }));
    expect(view.nearSchool.visible).toBe(false);
  });

  it('resolves city to null when the city is not valid', () => {
    const view = buildOverlaySurfaceView(makeViewParams({ isCityValid: false, city: 'nowhere' }));
    expect(view.nearSchool.city).toBeNull();
  });

  it('keeps city when valid', () => {
    const view = buildOverlaySurfaceView(makeViewParams({ isCityValid: true, city: 'bangalore' }));
    expect(view.nearSchool.city).toBe('bangalore');
  });
});

describe('buildOverlaySurfaceCommands', () => {
  it('narrows journeyCommands to wrappedSchoolSelect only', () => {
    const journeyCommands = {
      wrappedSchoolSelect: vi.fn(),
    } as unknown as DiscoverJourneyTransitionsCommands;
    const params: BuildOverlaySurfaceCommandsParams = {
      setNearSchoolOpen: vi.fn(),
      journeyCommands,
      handleFiltersChange: vi.fn(),
      handleBoardFilterChange: vi.fn(),
    };
    const commands = buildOverlaySurfaceCommands(params);
    expect(commands.onSchoolSelect).toBe(journeyCommands.wrappedSchoolSelect);
  });

  it('wires setNearSchoolOpen/onFiltersChange/onBoardFilterChange through verbatim', () => {
    const setNearSchoolOpen = vi.fn();
    const handleFiltersChange = vi.fn();
    const handleBoardFilterChange = vi.fn();
    const commands = buildOverlaySurfaceCommands({
      setNearSchoolOpen,
      journeyCommands: { wrappedSchoolSelect: vi.fn() } as unknown as DiscoverJourneyTransitionsCommands,
      handleFiltersChange,
      handleBoardFilterChange,
    });
    expect(commands.setNearSchoolOpen).toBe(setNearSchoolOpen);
    expect(commands.onFiltersChange).toBe(handleFiltersChange);
    expect(commands.onBoardFilterChange).toBe(handleBoardFilterChange);
  });
});
