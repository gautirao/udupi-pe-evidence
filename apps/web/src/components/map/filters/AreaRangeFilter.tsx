import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { resolvePrimaryAreaControlLabel } from '@/features/discover/filters/primaryAreaLabels';
import {
  applyAreaBound,
  classifyAreaBoundInput,
  describeAreaBoundRejection,
  MAX_AREA_SQFT,
  type AreaBoundKey,
  type AreaBoundRejection,
} from '@/features/discover/filters/areaBounds';

/**
 * Issue #2459 (AC6) — the contextual square-foot area control.
 *
 * One numeric range spans property shapes whose areas are not the same quantity: 1,200 sq ft of an
 * apartment is its BUILT-UP area, 1,200 sq ft of a plot is the LAND under it. The server resolves
 * that meaning per row; this control's job is to say out loud which meaning(s) the buyer is
 * currently comparing.
 *
 * Both the label and the mixed-selection disclosure come from
 * `features/discover/filters/primaryAreaLabels.ts` — the single declaration of that vocabulary,
 * shared with the selected-filter chip. NOTHING about the taxonomy is restated here: a second copy
 * is exactly the drift #2526 exists to prevent. If a label reads wrong, fix it there.
 *
 * The disclosure is an ACCEPTANCE CRITERION, not copy (D1: "Disclosure is NOT optional"). A broad
 * or mixed selection that shows `AREA (SQ FT)` with no sentence naming what is being compared is
 * dishonest however correct its predicate — which is why it is rendered as its own element with a
 * stable test id, so a test can fail when it goes missing.
 */
interface AreaRangeFilterProps {
  filters: PropertyFilters;
  onFiltersChange: (filters: PropertyFilters) => void;
}


export function AreaRangeFilter({ filters, onFiltersChange }: AreaRangeFilterProps) {
  const { label, disclosure } = resolvePrimaryAreaControlLabel({
    propertyTypes: filters.propertyTypes,
    commercialSubtypes: filters.commercialSubtypes,
  });

  const baseId = useId();
  const minId = `${baseId}-area-min`;
  const maxId = `${baseId}-area-max`;
  const disclosureId = `${baseId}-area-disclosure`;
  const errorId = { areaMinSqft: `${baseId}-area-min-error`, areaMaxSqft: `${baseId}-area-max-error` };

  /**
   * Why a bound was refused, per field. Purely presentational: it never becomes a filter, and it is
   * cleared by the next acceptable keystroke in that same field.
   *
   * This is the ONLY reason the control holds state at all. Without it a refusal would be
   * invisible — the buyer types a number, nothing happens, and the UI offers no account of itself,
   * which is the defect class `areaBounds.ts` exists to close rather than a smaller version of it.
   */
  const [rejected, setRejected] = useState<Partial<Record<AreaBoundKey, AreaBoundRejection>>>({});

  /**
   * What a bound may BE is owned by `features/discover/filters/areaBounds.ts`, not decided here —
   * the same module the URL parse boundary reads, so a value the control accepts and a value a
   * link accepts cannot drift apart.
   *
   * It settles three things this component previously got wrong by writing one key at a time: the
   * value is REPRESENTABLE as the server's `Integer` (integral AND within {@link MAX_AREA_SQFT} —
   * either failure 400s on Spring's request binding before the server's own validator can produce
   * its designed message), and the committed PAIR is never inverted (which the server answers with
   * a 400 by design, where "no results" is the honest buyer outcome).
   *
   * A refused value emits NO bound and leaves the prior one untouched — it is not rounded into a
   * search the buyer never asked for — and says so on screen.
   */
  const commit = (key: AreaBoundKey, raw: string) => {
    const input = classifyAreaBoundInput(raw);

    setRejected((prev) => ({
      ...prev,
      [key]: input.kind === 'rejected' ? input.reason : undefined,
    }));

    if (input.kind === 'rejected') return;
    onFiltersChange({ ...filters, ...applyAreaBound(filters, key, input.value) });
  };

  /** Joins the ids that actually exist; `undefined` when none do, so the attribute is omitted. */
  const describedBy = (key: AreaBoundKey) =>
    [disclosure !== null ? disclosureId : null, rejected[key] ? errorId[key] : null]
      .filter(Boolean)
      .join(' ') || undefined;

  const renderError = (key: AreaBoundKey) => {
    const reason = rejected[key];
    if (!reason) return null;
    return (
      <p
        id={errorId[key]}
        role="alert"
        className="text-xs text-destructive"
        data-testid={key === 'areaMinSqft' ? 'area-filter-min-error' : 'area-filter-max-error'}
      >
        {describeAreaBoundRejection(reason)}
      </p>
    );
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium" data-testid="area-filter-label">
        {label}
      </Label>

      {disclosure !== null && (
        <p
          id={disclosureId}
          className="text-xs text-muted-foreground"
          data-testid="area-filter-disclosure"
        >
          {disclosure}
        </p>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor={minId} className="text-xs text-muted-foreground">
            Min
          </Label>
          <Input
            id={minId}
            type="number"
            min={0}
            // AFFORDANCE ONLY — the real guard is `classifyAreaBoundInput` in `commit`. `step` and
            // `max` steer the spinner and are bypassed by typing or pasting; `max` reads the same
            // constant the guard does so the two cannot name different limits.
            step={1}
            max={MAX_AREA_SQFT}
            inputMode="numeric"
            placeholder="Any"
            value={filters.areaMinSqft ?? ''}
            onChange={(e) => commit('areaMinSqft', e.target.value)}
            aria-label={`Minimum ${label}`}
            aria-invalid={rejected.areaMinSqft ? true : undefined}
            aria-describedby={describedBy('areaMinSqft')}
            data-testid="area-filter-min"
          />
          {renderError('areaMinSqft')}
        </div>
        <span className="pb-2 text-xs text-muted-foreground" aria-hidden="true">
          –
        </span>
        <div className="flex-1 space-y-1">
          <Label htmlFor={maxId} className="text-xs text-muted-foreground">
            Max
          </Label>
          <Input
            id={maxId}
            type="number"
            min={0}
            // AFFORDANCE ONLY — see the note on the Min input.
            step={1}
            max={MAX_AREA_SQFT}
            inputMode="numeric"
            placeholder="Any"
            value={filters.areaMaxSqft ?? ''}
            onChange={(e) => commit('areaMaxSqft', e.target.value)}
            aria-label={`Maximum ${label}`}
            aria-invalid={rejected.areaMaxSqft ? true : undefined}
            aria-describedby={describedBy('areaMaxSqft')}
            data-testid="area-filter-max"
          />
          {renderError('areaMaxSqft')}
        </div>
      </div>
    </div>
  );
}
