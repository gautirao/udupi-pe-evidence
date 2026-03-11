import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Home, Building2, Route, Bus } from 'lucide-react';
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  SETTLEMENT_CATEGORIES,
  AMENITY_CATEGORY_ORDER,
  COMMERCIAL_AMENITY_ORDER,
  formatDistance,
} from '@/lib/poi-categories';

interface PoiResponse {
  id: string;
  name: string;
  category: string;
  distanceMeters: number | null;
  latitude: number | null;
  longitude: number | null;
  pinned: boolean;
  approved: boolean;
}

interface NearbyPoisProps {
  listingId: string;
  propertyType: string;
}

const SEMI_RURAL_THRESHOLD = 4;

function getMode(
  propertyType: string,
  pois: PoiResponse[],
): 'land' | 'apartment' | 'house-urban' | 'house-semi-rural' | 'commercial' {
  const amenityPois = pois.filter((p) => !SETTLEMENT_CATEGORIES.has(p.category));
  const nearbyAmenityCount = amenityPois.filter(
    (p) => p.distanceMeters != null && p.distanceMeters <= 1500,
  ).length;
  if (propertyType === 'land') return 'land';
  if (propertyType === 'apartment') return 'apartment';
  if (propertyType === 'commercial') return 'commercial';
  if (propertyType === 'house') {
    return nearbyAmenityCount >= SEMI_RURAL_THRESHOLD ? 'house-urban' : 'house-semi-rural';
  }
  return 'apartment';
}

function LoadingSkeleton({ heading }: { heading: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[44px] w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ heading }: { heading: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">Location details temporarily unavailable.</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface FactRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  distanceMeters: number | null;
  approx?: boolean;
}

function FactRow({ icon, label, value, distanceMeters, approx }: FactRowProps) {
  return (
    <div className="flex items-center min-h-[44px] gap-3">
      <span className="text-muted-foreground shrink-0" aria-hidden="true">
        {icon}
      </span>
      <dl className="flex-1 flex items-center gap-1 min-w-0">
        <dt className="text-sm text-muted-foreground shrink-0">{label} ·</dt>
        <dd className="text-sm font-medium truncate">{value}</dd>
      </dl>
      <div className="shrink-0 text-right">
        <span className="text-sm text-muted-foreground">{formatDistance(distanceMeters)}</span>
        {approx && (
          <span className="text-xs text-muted-foreground ml-1" aria-label="approximately">
            (approx.)
          </span>
        )}
      </div>
    </div>
  );
}

function OsmAttribution() {
  return (
    <p className="text-xs text-muted-foreground mt-3">
      &copy;{' '}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >
        OpenStreetMap
      </a>{' '}
      contributors (ODbL)
    </p>
  );
}

function byDistance(a: PoiResponse, b: PoiResponse): number {
  return (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity);
}

function nearest(pois: PoiResponse[], category: string): PoiResponse | undefined {
  return pois.filter((p) => p.category === category).sort(byDistance)[0];
}

function LandMode({ pois }: { pois: PoiResponse[] }) {
  const village = nearest(pois, 'VILLAGE_CENTER');
  const town = nearest(pois, 'TOWN_CENTER');
  const highway = nearest(pois, 'HIGHWAY');
  const busstop = pois
    .filter((p) => p.category === 'TRANSPORT' && p.distanceMeters != null && p.distanceMeters < 5000)
    .sort(byDistance)[0];

  const amenityPois = pois.filter((p) => !SETTLEMENT_CATEGORIES.has(p.category));

  // Max 2 per category, max 3 categories
  const amenityGrouped = new Map<string, PoiResponse[]>();
  for (const p of amenityPois) {
    const list = amenityGrouped.get(p.category) ?? [];
    if (list.length < 2) {
      list.push(p);
      amenityGrouped.set(p.category, list);
    }
  }
  const topCategories = [...amenityGrouped.keys()].slice(0, 3);

  const hasSettlement = village ?? town ?? highway ?? busstop;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Location & Access</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {!hasSettlement ? (
          <Alert>
            <AlertDescription>
              Location context not yet computed — check back shortly.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-0 divide-y">
            {village && (
              <FactRow
                icon={<Home className="h-4 w-4" />}
                label="Nearest village"
                value={village.name}
                distanceMeters={village.distanceMeters}
                approx
              />
            )}
            {town && (
              <FactRow
                icon={<Building2 className="h-4 w-4" />}
                label="Nearest town"
                value={town.name}
                distanceMeters={town.distanceMeters}
                approx
              />
            )}
            {highway && (
              <FactRow
                icon={<Route className="h-4 w-4" />}
                label="Road access"
                value={highway.name}
                distanceMeters={highway.distanceMeters}
                approx
              />
            )}
            {busstop && (
              <FactRow
                icon={<Bus className="h-4 w-4" />}
                label="Bus stop"
                value={busstop.name}
                distanceMeters={busstop.distanceMeters}
                approx
              />
            )}
          </div>
        )}

        {topCategories.length > 0 && (
          <>
            <Separator className="my-4" />
            <p className="text-xs font-medium text-muted-foreground mb-3">Also Nearby</p>
            <div className="space-y-3">
              {topCategories.map((cat) => (
                <div key={cat}>
                  <p className="text-xs text-muted-foreground mb-1">
                    {CATEGORY_ICONS[cat] ?? ''} {CATEGORY_LABELS[cat] ?? cat}
                  </p>
                  {(amenityGrouped.get(cat) ?? []).map((p) => (
                    <div key={p.id} className="flex justify-between text-sm py-0.5">
                      <span className="truncate mr-2">{p.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {formatDistance(p.distanceMeters)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        <OsmAttribution />
      </CardContent>
    </Card>
  );
}

function CategoryGridInner({
  pois,
  categoryOrder,
}: {
  pois: PoiResponse[];
  categoryOrder: readonly string[];
}) {
  const grouped = new Map<string, PoiResponse[]>();
  for (const p of pois) {
    const list = grouped.get(p.category) ?? [];
    list.push(p);
    grouped.set(p.category, list);
  }
  const orderedCats = [
    ...categoryOrder.filter((c) => grouped.has(c)),
    ...[...grouped.keys()].filter((c) => !(categoryOrder as readonly string[]).includes(c)),
  ];
  if (orderedCats.length === 0) return null;
  return (
    <div className="space-y-3">
      {orderedCats.map((cat) => (
        <div key={cat}>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            {CATEGORY_ICONS[cat] ?? ''} {CATEGORY_LABELS[cat] ?? cat}
          </p>
          {(grouped.get(cat) ?? []).slice(0, 3).map((p) => (
            <div key={p.id} className="flex justify-between text-sm py-0.5">
              <span className="truncate mr-2">{p.name}</span>
              <span className="text-muted-foreground shrink-0">
                {formatDistance(p.distanceMeters)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CategoryGrid({
  pois,
  heading,
  description,
  categoryOrder,
}: {
  pois: PoiResponse[];
  heading: string;
  description?: string;
  categoryOrder: readonly string[];
}) {
  const amenityPois = pois.filter((p) => !SETTLEMENT_CATEGORIES.has(p.category));

  const grouped = new Map<string, PoiResponse[]>();
  for (const p of amenityPois) {
    const list = grouped.get(p.category) ?? [];
    list.push(p);
    grouped.set(p.category, list);
  }
  const orderedCats = [
    ...categoryOrder.filter((c) => grouped.has(c)),
    ...[...grouped.keys()].filter((c) => !(categoryOrder as readonly string[]).includes(c)),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-4">
        {orderedCats.length === 0 ? (
          <Alert>
            <AlertDescription>
              No amenities confirmed yet — explore the map for context.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {orderedCats.map((cat) => {
              const catPois = (grouped.get(cat) ?? []).slice(0, 3);
              return (
                <div key={cat}>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {CATEGORY_ICONS[cat] ?? ''} {CATEGORY_LABELS[cat] ?? cat}
                  </p>
                  {catPois.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-0.5">
                      <span className="truncate mr-2">{p.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {formatDistance(p.distanceMeters)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        <OsmAttribution />
      </CardContent>
    </Card>
  );
}

function SemiRuralMode({ pois }: { pois: PoiResponse[] }) {
  const village = nearest(pois, 'VILLAGE_CENTER');
  const town = nearest(pois, 'TOWN_CENTER');
  const highway = nearest(pois, 'HIGHWAY');
  const amenityPois = pois.filter((p) => !SETTLEMENT_CATEGORIES.has(p.category));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Location & Essentials</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-0 divide-y">
          {village && (
            <FactRow
              icon={<Home className="h-4 w-4" />}
              label="Nearest village"
              value={village.name}
              distanceMeters={village.distanceMeters}
              approx
            />
          )}
          {town && (
            <FactRow
              icon={<Building2 className="h-4 w-4" />}
              label="Nearest town"
              value={town.name}
              distanceMeters={town.distanceMeters}
              approx
            />
          )}
          {highway && (
            <FactRow
              icon={<Route className="h-4 w-4" />}
              label="Road access"
              value={highway.name}
              distanceMeters={highway.distanceMeters}
              approx
            />
          )}
        </div>
        {amenityPois.length > 0 && (
          <>
            <Separator className="my-4" />
            <p className="text-sm font-medium mb-2">Found nearby</p>
            {amenityPois.map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1">
                <span className="truncate mr-2">
                  {CATEGORY_ICONS[p.category] ?? ''} {p.name}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {formatDistance(p.distanceMeters)}
                </span>
              </div>
            ))}
          </>
        )}
        <OsmAttribution />
      </CardContent>
    </Card>
  );
}

function CommercialMode({ pois }: { pois: PoiResponse[] }) {
  const town = nearest(pois, 'TOWN_CENTER');
  const highway = nearest(pois, 'HIGHWAY');

  const filteredAmenities = pois.filter(
    (p) =>
      p.category !== 'SCHOOL' &&
      p.category !== 'WORSHIP' &&
      !SETTLEMENT_CATEGORIES.has(p.category),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Location & Visibility</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {(town ?? highway) && (
          <div className="space-y-0 divide-y mb-4">
            {town && (
              <FactRow
                icon={<Building2 className="h-4 w-4" />}
                label="Nearest town"
                value={town.name}
                distanceMeters={town.distanceMeters}
                approx
              />
            )}
            {highway && (
              <FactRow
                icon={<Route className="h-4 w-4" />}
                label="Road access"
                value={highway.name}
                distanceMeters={highway.distanceMeters}
                approx
              />
            )}
          </div>
        )}
        <CategoryGridInner pois={filteredAmenities} categoryOrder={COMMERCIAL_AMENITY_ORDER} />
        <OsmAttribution />
      </CardContent>
    </Card>
  );
}

export function NearbyPois({ listingId, propertyType }: NearbyPoisProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pois', listingId],
    queryFn: () => api.get<PoiResponse[]>(`/api/listings/${listingId}/pois`),
  });

  const headingByType: Record<string, string> = {
    land: 'Location & Access',
    apartment: 'Nearby Essentials',
    commercial: 'Location & Visibility',
    house: 'Location & Essentials',
  };
  const heading = headingByType[propertyType] ?? 'Nearby';

  if (isLoading) return <LoadingSkeleton heading={heading} />;
  if (isError) return <ErrorCard heading={heading} />;

  const pois = data ?? [];
  const mode = getMode(propertyType, pois);

  if (mode === 'land') return <LandMode pois={pois} />;
  if (mode === 'commercial') return <CommercialMode pois={pois} />;
  if (mode === 'house-semi-rural') return <SemiRuralMode pois={pois} />;

  // Apartment or house-urban
  const town = nearest(pois, 'TOWN_CENTER');
  const townDesc = town
    ? `${formatDistance(town.distanceMeters)} from ${town.name} city center`
    : undefined;

  return (
    <CategoryGrid
      pois={pois}
      heading="Nearby Essentials"
      description={townDesc}
      categoryOrder={AMENITY_CATEGORY_ORDER}
    />
  );
}
