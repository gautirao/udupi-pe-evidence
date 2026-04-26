import { useState } from 'react';
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

export function HomepageFilterPanel() {
  const navigate = useNavigate();
  const [city, setCity] = useState('bangalore');
  const [areaKey, setAreaKey] = useState(ANY_AREA_SENTINEL);

  const { areas: areaOptions, isLoading: areasLoading } = useTrendingAreas();

  const cityAreas = areaOptions.filter((a) => {
    const district = a.areaKey.split('|')[2] ?? '';
    return (DISTRICT_TO_CITY_SLUG[district] ?? district.toLowerCase()) === city;
  });

  const areasToShow = cityAreas.length > 0 ? cityAreas : (AREA_DEFAULTS[city] ?? []);

  const handleCityChange = (value: string) => {
    setCity(value);
    setAreaKey(ANY_AREA_SENTINEL);
  };

  const handleExplore = () => {
    const params = new URLSearchParams({ city });
    const resolvedArea = areaKey === ANY_AREA_SENTINEL ? '' : areaKey;
    if (resolvedArea) params.set('areaKey', resolvedArea);
    navigate(`/discover?${params.toString()}`);
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
            onValueChange={setAreaKey}
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
