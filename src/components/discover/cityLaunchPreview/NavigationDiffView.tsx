import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useNavigationDiff } from '@/hooks/useCityLaunchNavigation';
import type { NavigationDiffAgainst } from '@/lib/schemas/navigationHierarchy';

/**
 * Issue #1955 (Areas PR A) item 4 — the revision structural DIFF view.
 * Consumes GET .../navigation/diff?against=BASE|PREVIOUS_REVISION.
 * Deliberately structural-only (added/removed/moved/relabeled/representative
 * changes + the overrides fingerprint) — no listing counts are read here,
 * matching the "excluded from any structural/checksum display" rule in item 5.
 *
 * `added`/`removed` are node-key strings, not node-summary objects
 * (NavigationTreeDiffResponse) — the backend diff only reports which keys
 * changed, not their label/type/depth. `overridesFingerprint` is nullable —
 * a zero-override revision (the default BASE diff, or after deleting the
 * last override) has none to report.
 */
export function NavigationDiffView() {
  const [against, setAgainst] = useState<NavigationDiffAgainst>('BASE');
  const diff = useNavigationDiff(against);

  return (
    <div className="space-y-4 p-4" data-testid="navigation-diff-view">
      <ToggleGroup
        type="single"
        value={against}
        onValueChange={(value) => {
          if (value === 'BASE' || value === 'PREVIOUS_REVISION') setAgainst(value);
        }}
        aria-label="Compare against"
      >
        <ToggleGroupItem value="BASE" aria-pressed={against === 'BASE'}>
          Against base
        </ToggleGroupItem>
        <ToggleGroupItem value="PREVIOUS_REVISION" aria-pressed={against === 'PREVIOUS_REVISION'}>
          Against previous revision
        </ToggleGroupItem>
      </ToggleGroup>

      {diff.isLoading && (
        <div className="space-y-2" aria-live="polite">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      )}

      {diff.isError && !diff.isLoading && (
        <div className="flex flex-col items-center gap-2 text-destructive" role="alert">
          <AlertCircle className="h-6 w-6" />
          <p className="text-sm font-medium">Failed to load the diff.</p>
          <Button variant="outline" size="sm" onClick={() => diff.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {diff.data && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Overrides fingerprint:{' '}
            <span className="font-mono">{diff.data.overridesFingerprint ?? '(none)'}</span>
          </p>

          {diff.data.added.length === 0 &&
            diff.data.removed.length === 0 &&
            diff.data.moved.length === 0 &&
            diff.data.relabeled.length === 0 &&
            diff.data.representativeChanges.length === 0 && (
              <p className="text-sm text-muted-foreground">No structural changes.</p>
            )}

          {diff.data.added.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Added</h3>
              <ul className="mt-1 space-y-1">
                {diff.data.added.map((nodeKey) => (
                  <li key={nodeKey} className="flex items-center gap-2 text-sm">
                    <Badge variant="default">+</Badge>
                    <span className="font-mono">{nodeKey}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {diff.data.removed.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Removed</h3>
              <ul className="mt-1 space-y-1">
                {diff.data.removed.map((nodeKey) => (
                  <li key={nodeKey} className="flex items-center gap-2 text-sm">
                    <Badge variant="destructive">−</Badge>
                    <span className="font-mono">{nodeKey}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {diff.data.moved.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Moved</h3>
              <ul className="mt-1 space-y-1">
                {diff.data.moved.map((m) => (
                  <li key={m.nodeKey} className="text-sm">
                    {m.nodeKey}: {m.fromParentNodeKey ?? '(none)'} → {m.toParentNodeKey ?? '(none)'}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {diff.data.relabeled.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Relabeled</h3>
              <ul className="mt-1 space-y-1">
                {diff.data.relabeled.map((r) => (
                  <li key={r.nodeKey} className="text-sm">
                    {r.nodeKey}: "{r.fromLabel}" → "{r.toLabel}"
                  </li>
                ))}
              </ul>
            </section>
          )}

          {diff.data.representativeChanges.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">Representative changes</h3>
              <ul className="mt-1 space-y-1">
                {diff.data.representativeChanges.map((r) => (
                  <li key={r.nodeKey} className="text-sm">
                    {r.nodeKey}: [{r.fromRepresentativeAreaKeys.join(', ')}] → [
                    {r.toRepresentativeAreaKeys.join(', ')}]
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
