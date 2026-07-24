import { useState, type FormEvent } from 'react';
import { AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useNavigationOverrides,
  useCreateNavigationOverride,
  useDeleteNavigationOverride,
} from '@/hooks/useCityLaunchNavigation';
import type {
  NavigationOverrideInput,
  NavigationOverrideKind,
  NavigationOverrideRecord,
} from '@/lib/schemas/navigationHierarchy';

const OVERRIDE_KIND_LABELS: Record<NavigationOverrideKind, string> = {
  EXCLUDE_AREA: 'Exclude area',
  REASSIGN_AREA_REGION: 'Reassign area to region',
  MOVE_AREA: 'Move area to another parent',
  RELABEL: 'Relabel node',
  SET_REPRESENTATIVES: 'Change representative areas',
};

// Object.keys() is typed string[] regardless of the source Record's key
// union — this cast is the standard unavoidable escape hatch for that,
// scoped to a `Record<NavigationOverrideKind, string>` literal directly
// above so it cannot silently drift from the real key set.
const OVERRIDE_KINDS = Object.keys(OVERRIDE_KIND_LABELS) as NavigationOverrideKind[];

function isOverrideKind(value: string): value is NavigationOverrideKind {
  return Object.prototype.hasOwnProperty.call(OVERRIDE_KIND_LABELS, value);
}

/** One line describing an applied override, exhaustive over the 5 kinds. */
function describeOverride(o: NavigationOverrideRecord): string {
  switch (o.kind) {
    case 'EXCLUDE_AREA':
      return `Exclude area ${o.subjectAreaKey}`;
    case 'REASSIGN_AREA_REGION':
      return `Reassign ${o.subjectAreaKey} → region ${o.targetRegionKey}`;
    case 'MOVE_AREA':
      return `Move ${o.subjectAreaKey} → ${o.targetNodeKey}`;
    case 'RELABEL':
      return `Relabel ${o.subjectNodeKey} → "${o.newLabel}"`;
    case 'SET_REPRESENTATIVES':
      return `Set representatives of ${o.subjectNodeKey} → [${o.newRepresentativeAreaKeys.join(', ')}]`;
    default: {
      const _exhaustive: never = o;
      return _exhaustive;
    }
  }
}

type FormState = {
  kind: NavigationOverrideKind;
  subjectAreaKey: string;
  subjectNodeKey: string;
  targetRegionKey: string;
  targetNodeKey: string;
  newLabel: string;
  newRepresentativeAreaKeys: string;
  reason: string;
};

const INITIAL_FORM: FormState = {
  kind: 'EXCLUDE_AREA',
  subjectAreaKey: '',
  subjectNodeKey: '',
  targetRegionKey: '',
  targetNodeKey: '',
  newLabel: '',
  newRepresentativeAreaKeys: '',
  reason: '',
};

/** Builds the discriminated-union payload for the current form kind, exhaustively. */
function buildOverrideInput(form: FormState): NavigationOverrideInput {
  const reason = form.reason.trim() ? form.reason.trim() : undefined;
  switch (form.kind) {
    case 'EXCLUDE_AREA':
      return { kind: 'EXCLUDE_AREA', subjectAreaKey: form.subjectAreaKey.trim(), reason };
    case 'REASSIGN_AREA_REGION':
      return {
        kind: 'REASSIGN_AREA_REGION',
        subjectAreaKey: form.subjectAreaKey.trim(),
        targetRegionKey: form.targetRegionKey.trim(),
        reason,
      };
    case 'MOVE_AREA':
      return {
        kind: 'MOVE_AREA',
        subjectAreaKey: form.subjectAreaKey.trim(),
        targetNodeKey: form.targetNodeKey.trim(),
        reason,
      };
    case 'RELABEL':
      return { kind: 'RELABEL', subjectNodeKey: form.subjectNodeKey.trim(), newLabel: form.newLabel.trim(), reason };
    case 'SET_REPRESENTATIVES':
      return {
        kind: 'SET_REPRESENTATIVES',
        subjectNodeKey: form.subjectNodeKey.trim(),
        newRepresentativeAreaKeys: form.newRepresentativeAreaKeys
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        reason,
      };
    default: {
      const _exhaustive: never = form.kind;
      return _exhaustive;
    }
  }
}

function isFormValid(form: FormState): boolean {
  switch (form.kind) {
    case 'EXCLUDE_AREA':
      return form.subjectAreaKey.trim().length > 0;
    case 'REASSIGN_AREA_REGION':
      return form.subjectAreaKey.trim().length > 0 && form.targetRegionKey.trim().length > 0;
    case 'MOVE_AREA':
      return form.subjectAreaKey.trim().length > 0 && form.targetNodeKey.trim().length > 0;
    case 'RELABEL':
      return form.subjectNodeKey.trim().length > 0 && form.newLabel.trim().length > 0;
    case 'SET_REPRESENTATIVES':
      return (
        form.subjectNodeKey.trim().length > 0 &&
        form.newRepresentativeAreaKeys.split(',').map((s) => s.trim()).filter(Boolean).length > 0
      );
    default: {
      const _exhaustive: never = form.kind;
      return _exhaustive;
    }
  }
}

export interface NavigationOverridesPanelProps {
  /** True only when the revision's lifecycle_status === 'PREPARED' — mutations are backend-enforced but also disabled here for UX. */
  editable: boolean;
}

/**
 * Issue #1955 (Areas PR A) item 6 — controlled overrides UI. NO free-form
 * drag/drop, NO sibling-merge — exactly the 5 backend-documented override
 * kinds via POST/DELETE .../navigation/overrides, gated on `editable`
 * (revision lifecycle_status === PREPARED, passed down from
 * CityLaunchPreview's existing useValidationState — not re-derived here).
 */
export function NavigationOverridesPanel({ editable }: NavigationOverridesPanelProps) {
  const overrides = useNavigationOverrides();
  const createOverride = useCreateNavigationOverride();
  const deleteOverride = useDeleteNavigationOverride();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isFormValid(form)) return;
    createOverride.mutate(buildOverrideInput(form), {
      onSuccess: () => setForm((f) => ({ ...INITIAL_FORM, kind: f.kind })),
    });
  }

  return (
    <div className="space-y-6 p-4" data-testid="navigation-overrides-panel">
      {!editable && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          This revision is not PREPARED — overrides are read-only.
        </div>
      )}

      <section>
        <h3 className="text-sm font-semibold">Applied overrides</h3>
        {overrides.isLoading && (
          <div className="mt-2 space-y-2" aria-live="polite">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {overrides.isError && !overrides.isLoading && (
          <div className="mt-2 flex items-center gap-2 text-destructive" role="alert">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load overrides.</span>
            <Button variant="outline" size="sm" onClick={() => overrides.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {overrides.data && overrides.data.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">No overrides applied yet.</p>
        )}
        {overrides.data && overrides.data.length > 0 && (
          <ul className="mt-2 space-y-2">
            {overrides.data.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                data-testid={`override-${o.id}`}
              >
                <span>
                  <Badge variant="secondary" className="mr-2">
                    {OVERRIDE_KIND_LABELS[o.kind]}
                  </Badge>
                  {describeOverride(o)}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!editable || deleteOverride.isPending}
                      aria-label={`Remove override: ${describeOverride(o)}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this override?</AlertDialogTitle>
                      <AlertDialogDescription>{describeOverride(o)}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteOverride.mutate(o.id)}>
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold">Add an override</h3>
        <form className="mt-2 space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor="override-kind">Kind</Label>
            <Select
              value={form.kind}
              onValueChange={(value) => {
                if (!isOverrideKind(value)) return;
                setForm((f) => ({ ...INITIAL_FORM, kind: value, reason: f.reason }));
              }}
              disabled={!editable}
            >
              <SelectTrigger id="override-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVERRIDE_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {OVERRIDE_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(form.kind === 'EXCLUDE_AREA' || form.kind === 'REASSIGN_AREA_REGION' || form.kind === 'MOVE_AREA') && (
            <div className="space-y-1">
              <Label htmlFor="subjectAreaKey">Area key</Label>
              <Input
                id="subjectAreaKey"
                value={form.subjectAreaKey}
                disabled={!editable}
                onChange={(e) => setForm((f) => ({ ...f, subjectAreaKey: e.target.value }))}
              />
            </div>
          )}

          {form.kind === 'REASSIGN_AREA_REGION' && (
            <div className="space-y-1">
              <Label htmlFor="targetRegionKey">Target region key</Label>
              <Input
                id="targetRegionKey"
                value={form.targetRegionKey}
                disabled={!editable}
                onChange={(e) => setForm((f) => ({ ...f, targetRegionKey: e.target.value }))}
              />
            </div>
          )}

          {form.kind === 'MOVE_AREA' && (
            <div className="space-y-1">
              <Label htmlFor="targetNodeKey">Target parent node key</Label>
              <Input
                id="targetNodeKey"
                value={form.targetNodeKey}
                disabled={!editable}
                onChange={(e) => setForm((f) => ({ ...f, targetNodeKey: e.target.value }))}
              />
            </div>
          )}

          {(form.kind === 'RELABEL' || form.kind === 'SET_REPRESENTATIVES') && (
            <div className="space-y-1">
              <Label htmlFor="subjectNodeKey">Node key</Label>
              <Input
                id="subjectNodeKey"
                value={form.subjectNodeKey}
                disabled={!editable}
                onChange={(e) => setForm((f) => ({ ...f, subjectNodeKey: e.target.value }))}
              />
            </div>
          )}

          {form.kind === 'RELABEL' && (
            <div className="space-y-1">
              <Label htmlFor="newLabel">New label</Label>
              <Input
                id="newLabel"
                value={form.newLabel}
                disabled={!editable}
                onChange={(e) => setForm((f) => ({ ...f, newLabel: e.target.value }))}
              />
            </div>
          )}

          {form.kind === 'SET_REPRESENTATIVES' && (
            <div className="space-y-1">
              <Label htmlFor="newRepresentativeAreaKeys">New representative area keys (comma-separated)</Label>
              <Input
                id="newRepresentativeAreaKeys"
                value={form.newRepresentativeAreaKeys}
                disabled={!editable}
                onChange={(e) => setForm((f) => ({ ...f, newRepresentativeAreaKeys: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={form.reason}
              disabled={!editable}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>

          <Button type="submit" disabled={!editable || !isFormValid(form) || createOverride.isPending}>
            {createOverride.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply override
          </Button>
        </form>
      </section>
    </div>
  );
}
