import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  useDiscoverSource,
  discoverPath,
  discoverKey,
} from '@/features/discover/state/DiscoverDataSourceContext';
import {
  navigationTreeResponseSchema,
  navigationDiffResponseSchema,
  navigationOverridesResponseSchema,
  navigationOverrideInputSchema,
  validationReportSchema,
  type NavigationTreeResponse,
  type NavigationDiffResponse,
  type NavigationDiffAgainst,
  type NavigationOverridesResponse,
  type NavigationOverrideInput,
  type ValidationReport,
} from '@/lib/schemas/navigationHierarchy';

/**
 * Issue #1955 (Areas PR A) — admin city-launch revision navigation hierarchy
 * hooks: sandbox tree, structural diff, and controlled overrides. Mirrors
 * the react-query-over-@/lib/api pattern in useCityLaunchValidation.ts, but
 * (like useDiscoverAreas.ts) reads cityId/revisionId from
 * useDiscoverSource() instead of taking them as hook params — these
 * endpoints have no live-mode counterpart, so every hook here is `enabled`
 * ONLY when the active source is a preview (mode === 'preview').
 */

function parseOrThrow<T>(schema: { parse: (input: unknown) => T }, raw: unknown, what: string): T {
  try {
    return schema.parse(raw);
  } catch (cause) {
    // Two-arg `new Error(message, { cause })` needs the ES2022 lib.error.d.ts
    // overload, which tsconfig.app.json's `lib: ["ES2020", ...]` doesn't
    // include (TS2554). Attach `cause` post-construction instead — same
    // runtime `error.cause` result, no lib/tsconfig change needed.
    console.error(`[Admin Preview] Schema parsing failed for ${what}:`, cause);
    const error = new Error(`Malformed ${what} response from the server`);
    throw Object.assign(error, { cause });
  }
}

function treeQueryKey(source: ReturnType<typeof useDiscoverSource>) {
  return discoverKey(source, 'admin-navigation-tree');
}

/** GET .../navigation/tree — the sandbox hierarchy tree for this revision. */
export function useNavigationTree() {
  const source = useDiscoverSource();
  const enabled = source.mode === 'preview';

  return useQuery<NavigationTreeResponse>({
    queryKey: treeQueryKey(source),
    queryFn: async () => {
      const path = discoverPath(source, '', { kind: 'navigationTree' });
      const raw = await api.get<unknown>(path);
      return parseOrThrow(navigationTreeResponseSchema, raw, 'navigation tree');
    },
    enabled,
    staleTime: 60_000,
  });
}

function diffQueryKey(source: ReturnType<typeof useDiscoverSource>, against: NavigationDiffAgainst) {
  return discoverKey(source, 'admin-navigation-diff', against);
}

/** GET .../navigation/diff?against=BASE|PREVIOUS_REVISION — structural-only diff. */
export function useNavigationDiff(against: NavigationDiffAgainst) {
  const source = useDiscoverSource();
  const enabled = source.mode === 'preview';

  return useQuery<NavigationDiffResponse>({
    queryKey: diffQueryKey(source, against),
    queryFn: async () => {
      const path = discoverPath(source, '', { kind: 'navigationDiff', against });
      const raw = await api.get<unknown>(path);
      return parseOrThrow(navigationDiffResponseSchema, raw, 'navigation diff');
    },
    enabled,
    staleTime: 30_000,
  });
}

function overridesQueryKey(source: ReturnType<typeof useDiscoverSource>) {
  return discoverKey(source, 'admin-navigation-overrides');
}

/**
 * GET .../navigation/overrides — the overrides currently applied to this
 * revision. Returns a bare array (AdminNavigationOverrideResponse[]), not
 * `{revisionId, overrides}` — see navigationOverridesResponseSchema.
 */
export function useNavigationOverrides() {
  const source = useDiscoverSource();
  const enabled = source.mode === 'preview';

  return useQuery<NavigationOverridesResponse>({
    queryKey: overridesQueryKey(source),
    queryFn: async () => {
      const path = discoverPath(source, '', { kind: 'navigationOverrides' });
      const raw = await api.get<unknown>(path);
      return parseOrThrow(navigationOverridesResponseSchema, raw, 'navigation overrides');
    },
    enabled,
    staleTime: 15_000,
  });
}

/** Extracts a human-readable message list from a 422 ApiError body, falling back to err.message. */
export function describeValidationReportError(err: ApiError): string[] {
  const parsed = validationReportSchema.safeParse(err.body);
  if (!parsed.success) return [err.message];
  const report: ValidationReport = parsed.data;
  const issues = report.issues ?? report.errors ?? [];
  if (issues.length === 0) return [err.message];
  return issues.map((issue) => issue.message);
}

/**
 * POST .../navigation/overrides — creates one of the 5 override kinds.
 * Success (200) returns the resulting diff, which we cache directly for
 * both diff queries (against BASE and against PREVIOUS_REVISION are both
 * invalidated since either could now differ). 400/409 surface a toast;
 * 422 (ValidationReport) surfaces the parsed issue messages as a blocking
 * destructive toast, matching the "blocking feedback" requirement.
 */
export function useCreateNavigationOverride() {
  const source = useDiscoverSource();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<NavigationDiffResponse, ApiError, NavigationOverrideInput>({
    mutationFn: async (input) => {
      // Fails fast client-side if a caller ever constructs an invalid
      // combination for the given `kind` (shouldn't happen given the
      // discriminated-union input type, but guards against `as`-casts).
      const body = navigationOverrideInputSchema.parse(input);
      if (source.mode !== 'preview') {
        throw new Error('Overrides can only be created against a preview revision');
      }
      const path = discoverPath(source, '', { kind: 'navigationOverrides' });
      const raw = await api.post<unknown>(path, body);
      return parseOrThrow(navigationDiffResponseSchema, raw, 'navigation diff');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: overridesQueryKey(source) });
      queryClient.invalidateQueries({ queryKey: diffQueryKey(source, 'BASE') });
      queryClient.invalidateQueries({ queryKey: diffQueryKey(source, 'PREVIOUS_REVISION') });
      queryClient.invalidateQueries({ queryKey: treeQueryKey(source) });
      toast({ title: 'Override applied' });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) {
        toast({
          title: 'Override rejected — validation failed',
          description: describeValidationReportError(err).join(' '),
          variant: 'destructive',
        });
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: 'Override conflicts with an existing one',
          description: err.message,
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Failed to apply override',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * DELETE .../navigation/overrides/{overrideId} — removes an applied
 * override. 404/409 surface a toast and re-sync the overrides list.
 */
export function useDeleteNavigationOverride() {
  const source = useDiscoverSource();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<NavigationDiffResponse, ApiError, number>({
    mutationFn: async (overrideId) => {
      if (source.mode !== 'preview') {
        throw new Error('Overrides can only be deleted against a preview revision');
      }
      const path = discoverPath(source, '', { kind: 'navigationOverrideDelete', overrideId });
      const raw = await api.delete<unknown>(path);
      return parseOrThrow(navigationDiffResponseSchema, raw, 'navigation diff');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: overridesQueryKey(source) });
      queryClient.invalidateQueries({ queryKey: diffQueryKey(source, 'BASE') });
      queryClient.invalidateQueries({ queryKey: diffQueryKey(source, 'PREVIOUS_REVISION') });
      queryClient.invalidateQueries({ queryKey: treeQueryKey(source) });
      toast({ title: 'Override removed' });
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        toast({
          title: 'Could not remove override',
          description: err.message,
          variant: 'destructive',
        });
        queryClient.invalidateQueries({ queryKey: overridesQueryKey(source) });
        return;
      }
      toast({
        title: 'Failed to remove override',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}
