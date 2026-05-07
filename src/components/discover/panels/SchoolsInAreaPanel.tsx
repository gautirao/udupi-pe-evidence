import { useMemo } from 'react';
import { GraduationCap, ChevronDown } from 'lucide-react';
import { useSchoolsByArea } from '@/hooks/useSchoolsByArea';
import { useDiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { PanelHeader } from '../PanelHeader';
import { Skeleton } from '@/components/ui/skeleton';

interface SchoolsInAreaPanelProps {
  journey: 'area-first' | 'school-first';
  onStartOver: () => void;
}

const BOARD_OPTIONS = ['CBSE', 'ICSE', 'State', 'International'];
const CATEGORY_OPTIONS = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'higher_secondary', label: 'Higher Secondary' },
];

export function SchoolsInAreaPanel({ journey, onStartOver }: SchoolsInAreaPanelProps) {
  const urlState = useDiscoverUrlState();
  const { data: areas = [] } = useDiscoverAreas(urlState.city);

  // Get areaLabel from cached areas
  const selectedArea = useMemo(
    () => areas.find((a) => a.areaKey === urlState.areaKey),
    [areas, urlState.areaKey],
  );
  const areaLabel = selectedArea?.name || urlState.areaKey?.split('|').pop() || 'Area';

  // Fetch schools with infinite query
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSchoolsByArea(
    urlState.areaKey,
    urlState.boardFilters || [],
    urlState.categoryFilters || [],
  );

  // Flatten pages into single school list
  const schools = useMemo(() => {
    return data?.pages.flatMap((page) => page.schools) || [];
  }, [data]);

  // Handler to toggle board filter
  const handleBoardToggle = (board: string) => {
    const next = (urlState.boardFilters || []).includes(board)
      ? (urlState.boardFilters || []).filter((b) => b !== board)
      : [...(urlState.boardFilters || []), board];

    urlState.urlActions.setFiltersLive({
      propertyTypes: urlState.propertyTypes,
      bedrooms: urlState.bedrooms,
      priceMin: urlState.priceMin,
      priceMax: urlState.priceMax,
      sellerTypes: urlState.sellerTypes,
      boardFilters: next,
      categoryFilters: urlState.categoryFilters,
      backOnMarket: urlState.backOnMarket,
      newToMarket: urlState.newToMarket,
      reraRegistered: urlState.reraRegistered,
      readyToMove: urlState.readyToMove,
    });
  };

  // Handler to toggle category filter
  const handleCategoryToggle = (category: string) => {
    const next = (urlState.categoryFilters || []).includes(category)
      ? (urlState.categoryFilters || []).filter((c) => c !== category)
      : [...(urlState.categoryFilters || []), category];

    urlState.urlActions.setFiltersLive({
      propertyTypes: urlState.propertyTypes,
      bedrooms: urlState.bedrooms,
      priceMin: urlState.priceMin,
      priceMax: urlState.priceMax,
      sellerTypes: urlState.sellerTypes,
      boardFilters: urlState.boardFilters,
      categoryFilters: next,
      backOnMarket: urlState.backOnMarket,
      newToMarket: urlState.newToMarket,
      reraRegistered: urlState.reraRegistered,
      readyToMove: urlState.readyToMove,
    });
  };

  // Handler for selecting a school
  const handleSelectSchool = (schoolId: string) => {
    urlState.urlActions.setSchoolParams({ schoolId, radiusKm: 2 });
  };

  // Handler to clear filters
  const handleClearFilters = () => {
    urlState.urlActions.setFiltersLive({
      propertyTypes: urlState.propertyTypes,
      bedrooms: urlState.bedrooms,
      priceMin: urlState.priceMin,
      priceMax: urlState.priceMax,
      sellerTypes: urlState.sellerTypes,
      boardFilters: [],
      categoryFilters: [],
      backOnMarket: urlState.backOnMarket,
      newToMarket: urlState.newToMarket,
      reraRegistered: urlState.reraRegistered,
      readyToMove: urlState.readyToMove,
    });
  };

  // Handler to pick different area
  const handlePickDifferentArea = () => {
    urlState.urlActions.clearAreaContext();
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <PanelHeader
        title={`Schools in ${areaLabel}`}
        journey={journey}
        onStartOver={onStartOver}
        subtitle="Choose a school to view nearby homes"
      />

      {/* Board Filter Chips */}
      <div className="px-4 py-3 border-b flex flex-wrap gap-2">
        {BOARD_OPTIONS.map((board) => {
          const isSelected = (urlState.boardFilters || []).includes(board);
          return (
            <button
              key={board}
              onClick={() => handleBoardToggle(board)}
              data-testid={`board-chip-${board.toLowerCase()}`}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'border border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {board}
            </button>
          );
        })}
      </div>

      {/* Category Filter Chips */}
      <div className="px-4 py-3 border-b flex flex-wrap gap-2">
        {CATEGORY_OPTIONS.map(({ value, label }) => {
          const isSelected = (urlState.categoryFilters || []).includes(value);
          return (
            <button
              key={value}
              onClick={() => handleCategoryToggle(value)}
              data-testid={`category-chip-${value}`}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'border border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* School List or Empty State */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 space-y-3">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="p-3 rounded-lg space-y-2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {schools.length > 0 && (
          <div className="space-y-2 p-4">
            {schools.map((school) => (
              <div
                key={school.id}
                onClick={() => handleSelectSchool(school.id)}
                data-testid="school-card"
                className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 border border-purple-200 rounded-lg cursor-pointer hover:shadow-lg transition-shadow"
              >
                <div className="flex gap-3">
                  <GraduationCap className="w-6 h-6 text-white flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{school.name}</h3>
                    <p className="text-sm text-purple-100 truncate">{school.address}</p>
                    <div className="text-xs text-purple-100 mt-1 flex gap-2 flex-wrap">
                      {(school.board || school.boardType) && (
                        <span>{school.board || school.boardType}</span>
                      )}
                      {school.schoolCategory && (
                        <>
                          <span>·</span>
                          <span className="capitalize">
                            {school.schoolCategory.replace('_', ' ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full mt-4 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm font-medium"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more schools'}
              </button>
            )}
          </div>
        )}

        {schools.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
            <GraduationCap className="w-12 h-12 text-gray-300 mb-3" />
            <h3 className="text-lg font-semibold text-gray-900">No schools found</h3>
            <p className="text-sm text-gray-600 mt-1 mb-6">
              Try adjusting your filters or pick a different area
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <button
                onClick={handleClearFilters}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                Clear filters
              </button>
              <button
                onClick={handlePickDifferentArea}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 text-sm font-medium"
              >
                Pick a different area
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
