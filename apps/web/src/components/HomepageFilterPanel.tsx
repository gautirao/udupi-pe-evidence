import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTrendingAreas } from '@/hooks/useTrendingAreas';
import { AREA_DEFAULTS } from '@/constants/areaDefaults';
import { DISTRICT_TO_CITY_SLUG } from '@/lib/localityUtils';
import { CITIES, ANY_AREA_SENTINEL } from '@/constants/cities';
import { useDiscoverAreaNavigationPathResolver } from '@/features/discover/navigation/useDiscoverAreaNavigationPath';

interface HomepageFilterPanelProps {
  city: string;
  areaKey: string;
  onCityChange: (city: string) => void;
  onAreaKeyChange: (areaKey: string) => void;
}

export function HomepageFilterPanel({
  city,
  areaKey,
  onCityChange,
  onAreaKeyChange,
}: HomepageFilterPanelProps) {
  const navigate = useNavigate();
  // Issue #2088 QA-FIX — a bare `/discover?city=&areaKey=` now defaults to
  // journey=area-first (area.ts), and DiscoverRightPanelContainer's
  // documented A1-MINIMAL behaviour silently ignores a stale areaKey= on a
  // hand-navigated area-first URL (it never reads the legacy param), so the
  // user's chosen area was being dropped on arrival. Resolving through the
  // SAME canonical navigation-path seam DiscoverControlBar's area search
  // already uses (`useDiscoverAreaNavigationPathResolver` ->
  // `enterAreasJourney`'s `journey=area-first&node=` pair) before navigating
  // means the destination URL is already in the shape the canonical panel
  // actually reads, so the selection survives.
  const resolveAreaNavigationPath = useDiscoverAreaNavigationPathResolver();

  const { areas: areaOptions, isLoading: areasLoading } = useTrendingAreas();

  const cityAreas = areaOptions.filter((a) => {
    const district = a.areaKey.split('|')[2] ?? '';
    return (DISTRICT_TO_CITY_SLUG[district] ?? district.toLowerCase()) === city;
  });

  const areasToShow = cityAreas.length > 0 ? cityAreas : (AREA_DEFAULTS[city] ?? []);

  const handleCityChange = (value: string) => {
    onCityChange(value);
    // areaKey reset is handled by LandingPage's onCityChange (handleCityChange)
  };

  const handleExplore = () => {
    const resolvedArea = areaKey === ANY_AREA_SENTINEL ? '' : areaKey;
    if (!resolvedArea) {
      navigate(`/discover?${new URLSearchParams({ city }).toString()}`);
      return;
    }
    resolveAreaNavigationPath.mutate(
      { city, areaKey: resolvedArea },
      {
        onSuccess: (path) => {
          const params = new URLSearchParams({ city, journey: 'area-first', node: path.nodeKey });
          navigate(`/discover?${params.toString()}`);
        },
        onError: () => {
          // The chosen area could not be resolved to a canonical node (stale/
          // invalid areaKey) — degrade to the city view rather than writing a
          // legacy areaKey= the canonical area-first default would silently
          // ignore (the exact defect this fix closes).
          navigate(`/discover?${new URLSearchParams({ city }).toString()}`);
        },
      },
    );
  };

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardContent className="p-8 flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Find your next property</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Filter by city and area to get started.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Select value={city} onValueChange={handleCityChange}>
            <SelectTrigger aria-label="Select city">
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              {CITIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={areaKey}
            onValueChange={onAreaKeyChange}
            disabled={areasLoading && areasToShow.length === 0}
          >
            <SelectTrigger aria-label="Select area">
              <SelectValue placeholder="Any area (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_AREA_SENTINEL}>Any area</SelectItem>
              {areasToShow.map((a) => (
                <SelectItem key={a.areaKey} value={a.areaKey}>
                  {a.areaLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          size="lg"
          onClick={handleExplore}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          Explore on Map
        </Button>
      </CardContent>
    </Card>
  );
}
