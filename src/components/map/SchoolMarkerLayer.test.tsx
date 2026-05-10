import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SchoolMarkerLayer } from './SchoolMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

// Mock Leaflet
vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn((config) => config),
    marker: vi.fn(() => ({
      bindTooltip: vi.fn(function() { return this; }),
      on: vi.fn(function() { return this; }),
      addTo: vi.fn(function() { return this; }),
      remove: vi.fn(),
    })),
  },
}));

vi.mock('@/lib/security', () => ({
  escapeHtml: (html: string) => html,
}));

const mockSchools: SchoolResult[] = [
  {
    id: 'school-1',
    name: 'Test School 1',
    latitude: 13.34,
    longitude: 74.74,
    category: 'primary',
    board: 'ICSE',
  },
  {
    id: 'school-2',
    name: 'Test School 2',
    latitude: 13.35,
    longitude: 74.75,
    category: 'secondary',
    board: 'CBSE',
  },
];

describe('SchoolMarkerLayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.warn = vi.fn();
  });

  describe('loading state', () => {
    it('renders loading spinner when isLoading=true in school-first journey', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={true}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      const loader = screen.getByTestId('school-marker-loading');
      expect(loader).toBeInTheDocument();
      expect(loader).toHaveTextContent('Loading schools...');
    });

    it('does not render loading spinner in area-first journey', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="area-first"
          isLoading={true}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(screen.queryByTestId('school-marker-loading')).not.toBeInTheDocument();
    });

    it('does not render loading spinner when isLoading=false', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={false}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(screen.queryByTestId('school-marker-loading')).not.toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('renders error message when isError=true in school-first journey', () => {
      const error = new Error('Failed to fetch schools');
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={false}
          isError={true}
          error={error}
          onSelectSchool={vi.fn()}
        />
      );

      const errorDiv = screen.getByTestId('school-marker-error');
      expect(errorDiv).toBeInTheDocument();
      expect(errorDiv).toHaveTextContent('Failed to fetch schools');
    });

    it('renders generic error message when error prop is null', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={false}
          isError={true}
          error={null}
          onSelectSchool={vi.fn()}
        />
      );

      const errorDiv = screen.getByTestId('school-marker-error');
      expect(errorDiv).toBeInTheDocument();
      expect(errorDiv).toHaveTextContent('Failed to load schools');
    });

    it('does not render error message in area-first journey', () => {
      const error = new Error('API error');
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="area-first"
          isLoading={false}
          isError={true}
          error={error}
          onSelectSchool={vi.fn()}
        />
      );

      expect(screen.queryByTestId('school-marker-error')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders empty message when schools.length=0 after successful load in school-first journey', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={false}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      const emptyDiv = screen.getByTestId('school-marker-empty');
      expect(emptyDiv).toBeInTheDocument();
      expect(emptyDiv).toHaveTextContent('No schools found in this area');
    });

    it('does not render empty message when schools.length > 0', () => {
      render(
        <SchoolMarkerLayer
          schools={mockSchools}
          journey="school-first"
          isLoading={false}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(screen.queryByTestId('school-marker-empty')).not.toBeInTheDocument();
    });

    it('does not render empty message while loading', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={true}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(screen.queryByTestId('school-marker-empty')).not.toBeInTheDocument();
    });

    it('does not render empty message when error occurred', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={false}
          isError={true}
          error={new Error('API error')}
          onSelectSchool={vi.fn()}
        />
      );

      expect(screen.queryByTestId('school-marker-empty')).not.toBeInTheDocument();
    });

    it('does not render empty message in area-first journey', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="area-first"
          isLoading={false}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(screen.queryByTestId('school-marker-empty')).not.toBeInTheDocument();
    });
  });

  describe('console.warn on empty state', () => {
    it('logs console.warn when schools.length=0 after successful load in school-first journey', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={false}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(console.warn).toHaveBeenCalledWith(
        '[SchoolMarkerLayer] No schools found for selected area in school-first journey'
      );
    });

    it('does not log console.warn while loading', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={true}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('does not log console.warn when error occurred', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={false}
          isError={true}
          error={new Error('API error')}
          onSelectSchool={vi.fn()}
        />
      );

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('does not log console.warn when schools are found', () => {
      render(
        <SchoolMarkerLayer
          schools={mockSchools}
          journey="school-first"
          isLoading={false}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('does not log console.warn in area-first journey', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="area-first"
          isLoading={false}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('renders null when journey is not school-first and no errors', () => {
      const { container } = render(
        <SchoolMarkerLayer
          schools={[]}
          journey="area-first"
          isLoading={false}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('loading state takes precedence over empty state', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={true}
          isError={false}
          onSelectSchool={vi.fn()}
        />
      );

      expect(screen.getByTestId('school-marker-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('school-marker-empty')).not.toBeInTheDocument();
    });

    it('error state takes precedence over empty state', () => {
      render(
        <SchoolMarkerLayer
          schools={[]}
          journey="school-first"
          isLoading={false}
          isError={true}
          error={new Error('API error')}
          onSelectSchool={vi.fn()}
        />
      );

      expect(screen.getByTestId('school-marker-error')).toBeInTheDocument();
      expect(screen.queryByTestId('school-marker-empty')).not.toBeInTheDocument();
    });
  });
});
