// Issue #2657 C2b — verbatim extraction of the area hydration/not-found leaves
// (previously inline closures `renderAreaHydrating`/`renderAreaNotFound` in
// components/discover/DiscoverRightPanel.tsx, lines 1293-1322 as of C1).
// Byte-identical render output; only the surrounding module boundary
// (closures -> components with explicit props) changed. Shared by the
// area-selected and schools-in-area branches. See
// DiscoverRightPanel.leafSnapshots2657.test.tsx (C2a) for the DOM proof.
import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Issue #1064 AC3 — explicit hydration/not-found UIs replace the silent
// GuidedEntryPanel fallback when a URL declares an areaKey but resolution
// has not (yet) resolved. We render two small inline JSX blocks shared by the
// area-selected and schools-in-area branches.
export function AreaHydrating(): React.ReactElement {
  return (
    <div
      data-testid="discover-area-hydrating"
      className="m-5 flex flex-1 items-center justify-center rounded-xl border border-border bg-muted/20 p-8 shadow-sm"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Loading area details…</p>
        <p className="text-xs text-muted-foreground">Fetching locality listings and boundaries.</p>
      </div>
    </div>
  );
}

export interface AreaNotFoundProps {
  areaKey: string;
  onStartOver: () => void;
}

export function AreaNotFound({ areaKey, onStartOver }: AreaNotFoundProps): React.ReactElement {
  return (
    <div
      data-testid="discover-area-not-found"
      className="m-5 flex flex-1 items-center justify-center rounded-xl border border-border bg-muted/20 p-8 shadow-sm"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">Area not found</h2>
        <p className="text-sm text-muted-foreground break-all">
          We could not find an area for <span className="font-mono">{areaKey}</span>.
        </p>
        <Button variant="outline" size="sm" onClick={onStartOver}>
          Back to Discover
        </Button>
      </div>
    </div>
  );
}
