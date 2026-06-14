// AgriFiltersPanel — acreage + price range filter controls for agri selected-region view
// Issue #1457
import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgriFilterValues {
  agriAcresMin?: number;
  agriAcresMax?: number;
  agriPriceMin?: number;
  agriPriceMax?: number;
}

interface AgriFiltersPanelProps {
  acresMin?: number;
  acresMax?: number;
  priceMinRupees?: number;
  priceMaxRupees?: number;
  isAuthenticated: boolean;
  onApply: (filters: AgriFilterValues) => void;
  onClear: () => void;
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
}: AgriFiltersPanelProps) {
  const [localAcresMin, setLocalAcresMin] = useState(acresMin != null ? String(acresMin) : '');
  const [localAcresMax, setLocalAcresMax] = useState(acresMax != null ? String(acresMax) : '');
  const [localPriceMin, setLocalPriceMin] = useState(priceMinRupees != null ? String(priceMinRupees) : '');
  const [localPriceMax, setLocalPriceMax] = useState(priceMaxRupees != null ? String(priceMaxRupees) : '');

  // Sync local state when URL-driven props change (e.g. after clearAgriFilters).
  // Single effect with all deps to avoid up to 4 re-render cycles on clearAgriFilters.
  useEffect(() => {
    setLocalAcresMin(acresMin != null ? String(acresMin) : '');
    setLocalAcresMax(acresMax != null ? String(acresMax) : '');
    setLocalPriceMin(priceMinRupees != null ? String(priceMinRupees) : '');
    setLocalPriceMax(priceMaxRupees != null ? String(priceMaxRupees) : '');
  }, [acresMin, acresMax, priceMinRupees, priceMaxRupees]);

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
