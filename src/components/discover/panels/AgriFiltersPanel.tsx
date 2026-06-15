// AgriFiltersPanel — acreage + price range + categorical filter controls for agri selected-region view
// Issue #1457, #1458
import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Constants ────────────────────────────────────────────────────────────────

const LAND_CATEGORY_OPTIONS = [
  { value: 'FARMLAND', label: 'Farmland' },
  { value: 'PLANTATION', label: 'Plantation' },
  { value: 'FARM_PLOT', label: 'Farm plot' },
  { value: 'AGRICULTURAL_PLOT', label: 'Agricultural plot' },
  { value: 'OTHER', label: 'Other' },
] as const;

const WATER_SOURCE_OPTIONS = [
  { value: 'WELL', label: 'Well' },
  { value: 'BOREWELL', label: 'Borewell' },
  { value: 'POND', label: 'Pond' },
  { value: 'STREAM', label: 'Stream' },
  { value: 'NOT_AVAILABLE', label: 'Not available' },
  { value: 'OTHER', label: 'Other' },
] as const;

// Sentinel for "no filter selected" in shadcn Select (empty string placeholder).
// We never write this to state — it maps to null on apply.
const NO_FILTER = '__none__';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgriFilterValues {
  agriAcresMin?: number;
  agriAcresMax?: number;
  agriPriceMin?: number;
  agriPriceMax?: number;
  /** Issue #1458 — land category exact-match filter. null = no filter. */
  agriLandCategory?: string | null;
  /** Issue #1458 — farmhouse available tri-state filter. null = no filter. */
  agriFarmhouseAvailable?: boolean | null;
  /** Issue #1458 — fencing done tri-state filter. null = no filter. */
  agriFencingDone?: boolean | null;
  /** Issue #1458 — water source exact-match filter. null = no filter. */
  agriWaterSource?: string | null;
}

interface AgriFiltersPanelProps {
  acresMin?: number;
  acresMax?: number;
  priceMinRupees?: number;
  priceMaxRupees?: number;
  isAuthenticated: boolean;
  onApply: (filters: AgriFilterValues) => void;
  onClear: () => void;
  /** Issue #1458 — active land category filter from URL. */
  agriLandCategory?: string | null;
  /** Issue #1458 — active farmhouse available filter from URL. */
  agriFarmhouseAvailable?: boolean | null;
  /** Issue #1458 — active fencing done filter from URL. */
  agriFencingDone?: boolean | null;
  /** Issue #1458 — active water source filter from URL. */
  agriWaterSource?: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgriFiltersPanel({
  acresMin,
  acresMax,
  priceMinRupees,
  priceMaxRupees,
  isAuthenticated,
  onApply,
  onClear,
  agriLandCategory,
  agriFarmhouseAvailable,
  agriFencingDone,
  agriWaterSource,
}: AgriFiltersPanelProps) {
  const [localAcresMin, setLocalAcresMin] = useState(acresMin != null ? String(acresMin) : '');
  const [localAcresMax, setLocalAcresMax] = useState(acresMax != null ? String(acresMax) : '');
  const [localPriceMin, setLocalPriceMin] = useState(priceMinRupees != null ? String(priceMinRupees) : '');
  const [localPriceMax, setLocalPriceMax] = useState(priceMaxRupees != null ? String(priceMaxRupees) : '');
  // Issue #1458 — local state for categorical/boolean select filters.
  // We use a string sentinel (NO_FILTER) to represent "not selected" so shadcn Select
  // can show the placeholder. On apply we convert back to null.
  const [localLandCategory, setLocalLandCategory] = useState<string>(agriLandCategory ?? NO_FILTER);
  const [localFarmhouse, setLocalFarmhouse] = useState<string>(
    agriFarmhouseAvailable === true ? 'true' : agriFarmhouseAvailable === false ? 'false' : NO_FILTER,
  );
  const [localFencing, setLocalFencing] = useState<string>(
    agriFencingDone === true ? 'true' : agriFencingDone === false ? 'false' : NO_FILTER,
  );
  const [localWaterSource, setLocalWaterSource] = useState<string>(agriWaterSource ?? NO_FILTER);

  // Sync local state when URL-driven props change (e.g. after clearAgriFilters).
  // Single effect with all deps to avoid up to 8 re-render cycles on clearAgriFilters.
  useEffect(() => {
    setLocalAcresMin(acresMin != null ? String(acresMin) : '');
    setLocalAcresMax(acresMax != null ? String(acresMax) : '');
    setLocalPriceMin(priceMinRupees != null ? String(priceMinRupees) : '');
    setLocalPriceMax(priceMaxRupees != null ? String(priceMaxRupees) : '');
    setLocalLandCategory(agriLandCategory ?? NO_FILTER);
    setLocalFarmhouse(
      agriFarmhouseAvailable === true ? 'true' : agriFarmhouseAvailable === false ? 'false' : NO_FILTER,
    );
    setLocalFencing(
      agriFencingDone === true ? 'true' : agriFencingDone === false ? 'false' : NO_FILTER,
    );
    setLocalWaterSource(agriWaterSource ?? NO_FILTER);
  }, [acresMin, acresMax, priceMinRupees, priceMaxRupees, agriLandCategory, agriFarmhouseAvailable, agriFencingDone, agriWaterSource]);

  const parsedAcresMin = localAcresMin !== '' ? parseFloat(localAcresMin) : undefined;
  const parsedAcresMax = localAcresMax !== '' ? parseFloat(localAcresMax) : undefined;
  const parsedPriceMin = localPriceMin !== '' ? parseFloat(localPriceMin) : undefined;
  const parsedPriceMax = localPriceMax !== '' ? parseFloat(localPriceMax) : undefined;

  const acresInvalid =
    parsedAcresMin != null && parsedAcresMax != null && parsedAcresMin > parsedAcresMax;
  const priceInvalid =
    parsedPriceMin != null && parsedPriceMax != null && parsedPriceMin > parsedPriceMax;

  const handleApply = () => {
    onApply({
      agriAcresMin: parsedAcresMin,
      agriAcresMax: parsedAcresMax,
      agriPriceMin: isAuthenticated ? parsedPriceMin : undefined,
      agriPriceMax: isAuthenticated ? parsedPriceMax : undefined,
      // Issue #1458 — categorical/boolean: NO_FILTER sentinel maps to null (no filter).
      agriLandCategory: localLandCategory !== NO_FILTER ? localLandCategory : null,
      agriFarmhouseAvailable: localFarmhouse === 'true' ? true : localFarmhouse === 'false' ? false : null,
      agriFencingDone: localFencing === 'true' ? true : localFencing === 'false' ? false : null,
      agriWaterSource: localWaterSource !== NO_FILTER ? localWaterSource : null,
    });
  };

  return (
    <div
      data-testid="agri-filters-panel"
      className="px-4 py-3 border-b border-border bg-muted/10 space-y-3"
    >
      {/* Acreage */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Acreage (acres)</Label>
        <div className="flex gap-2 items-center">
          <Input
            data-testid="agri-acres-min"
            type="number"
            min={0}
            step="any"
            placeholder="Min"
            value={localAcresMin}
            onChange={(e) => setLocalAcresMin(e.target.value)}
            className="h-8 text-sm"
          />
          <span className="text-xs text-muted-foreground shrink-0">to</span>
          <Input
            data-testid="agri-acres-max"
            type="number"
            min={0}
            step="any"
            placeholder="Max"
            value={localAcresMax}
            onChange={(e) => setLocalAcresMax(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        {acresInvalid && (
          <p className="text-xs text-destructive">Min must be &le; Max</p>
        )}
      </div>

      {/* Price */}
      {isAuthenticated ? (
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Price (&#8377;)</Label>
          <div className="flex gap-2 items-center">
            <Input
              data-testid="agri-price-min"
              type="number"
              min={0}
              step="any"
              placeholder="Min"
              value={localPriceMin}
              onChange={(e) => setLocalPriceMin(e.target.value)}
              className="h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground shrink-0">to</span>
            <Input
              data-testid="agri-price-max"
              type="number"
              min={0}
              step="any"
              placeholder="Max"
              value={localPriceMax}
              onChange={(e) => setLocalPriceMax(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          {priceInvalid && (
            <p className="text-xs text-destructive">Min must be &le; Max</p>
          )}
        </div>
      ) : (
        <div
          data-testid="agri-price-locked"
          className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/40 border border-dashed border-border"
        >
          <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">Sign in to filter by price</span>
        </div>
      )}

      {/* Issue #1458 — Land category */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Land category</Label>
        <Select value={localLandCategory} onValueChange={setLocalLandCategory}>
          <SelectTrigger
            data-testid="agri-land-category-select"
            className="h-8 text-sm"
          >
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FILTER}>All</SelectItem>
            {LAND_CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Issue #1458 — Farmhouse available */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Farmhouse available</Label>
        <Select value={localFarmhouse} onValueChange={setLocalFarmhouse}>
          <SelectTrigger
            data-testid="agri-farmhouse-select"
            className="h-8 text-sm"
          >
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FILTER}>Any</SelectItem>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Issue #1458 — Fencing done */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Fencing done</Label>
        <Select value={localFencing} onValueChange={setLocalFencing}>
          <SelectTrigger
            data-testid="agri-fencing-select"
            className="h-8 text-sm"
          >
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FILTER}>Any</SelectItem>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Issue #1458 — Water source */}
      <div className="space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Water source</Label>
        <Select value={localWaterSource} onValueChange={setLocalWaterSource}>
          <SelectTrigger
            data-testid="agri-water-source-select"
            className="h-8 text-sm"
          >
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FILTER}>Any</SelectItem>
            {WATER_SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          data-testid="agri-filters-apply"
          size="sm"
          className="flex-1 h-8 text-xs"
          onClick={handleApply}
        >
          Apply Filters
        </Button>
        <Button
          data-testid="agri-filters-clear"
          size="sm"
          variant="outline"
          className="flex-1 h-8 text-xs"
          onClick={onClear}
        >
          Clear Filters
        </Button>
      </div>
    </div>
  );
}
