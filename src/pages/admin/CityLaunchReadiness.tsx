import { ShieldCheck, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VALIDATION_CHECK_ITEMS, type ValidationStateDto } from '@/hooks/useCityLaunchValidation';

/**
 * Issue #1911 PR4 — launch-readiness summary, reachable only from within the
 * CityLaunchPreview flow (no new top-level route) once a revision's
 * validation state is VALIDATED and not superseded. Mirrors
 * ui_kits/admin/LaunchScreen.jsx's "Ready to launch" summary card, minus the
 * actual launch action: the Launch entry here is INERT — a disabled
 * placeholder with no onClick, no endpoint call, no type-to-confirm. PR5
 * owns wiring the real launch mutation and confirmation gate.
 */

export interface CityLaunchReadinessProps {
  validation: ValidationStateDto;
}

export default function CityLaunchReadiness({ validation }: CityLaunchReadinessProps) {
  const { cityId, revisionNumber, lifecycleStatus, checks, preparedAt, validatedAt } = validation;

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl" data-testid="city-launch-readiness">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">Launch readiness</h2>
        <Badge className="bg-green-100 text-green-800 border border-green-300">
          {lifecycleStatus}
        </Badge>
        <span className="text-xs font-mono text-muted-foreground">
          city {cityId} · rev {revisionNumber}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-green-600" aria-hidden="true" />
            All {VALIDATION_CHECK_ITEMS.length} checkpoints validated
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y divide-border">
            {VALIDATION_CHECK_ITEMS.map(({ key, label, note }) => (
              <li key={key} className="flex items-center gap-3 py-2">
                <span
                  className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-green-600 text-xs font-bold text-white"
                  aria-hidden="true"
                >
                  ✓
                </span>
                <div>
                  <div className="text-sm font-semibold">
                    {label} — {note}
                  </div>
                </div>
                <span className="ml-auto text-xs font-mono text-green-700">
                  {checks[key] ? 'pass' : 'pending'}
                </span>
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-muted-foreground">
            <div>
              <span className="font-semibold text-foreground">Prepared</span>
              <div className="font-mono">{preparedAt ?? '—'}</div>
            </div>
            <div>
              <span className="font-semibold text-foreground">Validated</span>
              <div className="font-mono">{validatedAt ?? '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex items-start gap-2 rounded-md border bg-muted/30 p-4">
        <Lock className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            Launch is not wired up in this slice — promoting this revision to production is a
            separate, doubly-guarded action (type-to-confirm) that ships in a follow-up.
          </p>
          <Button
            type="button"
            variant="default"
            className="mt-3"
            disabled
            aria-disabled="true"
            data-testid="launch-entry-inert"
          >
            Launch city
          </Button>
        </div>
      </div>
    </div>
  );
}
