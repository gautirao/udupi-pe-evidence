/**
 * Typed test helpers for building React-Query v5 mock results.
 *
 * @tanstack/react-query v5 discriminant unions (`UseQueryResult<T, E>` /
 * `UseInfiniteQueryResult<T, E>`) require ~20+ internally-consistent fields
 * (status, fetchStatus, error, isPending, isLoadingError, isRefetchError, ...).
 * A partial object cast directly (`{ data, isLoading, isError, refetch } as
 * ReturnType<typeof useSomeQuery>`) fails TS2352 because the partial shape does
 * not sufficiently overlap with any member of the union.
 *
 * These helpers build a COMPLETE, internally-consistent object for the
 * requested state (derived from the `isLoading`/`isError` overrides) and merge
 * caller overrides on top, without any type suppression.
 */
import type { UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query';

// ── useQuery ─────────────────────────────────────────────────────────────────

type SuccessQueryResult<TData> = Extract<UseQueryResult<TData, Error>, { status: 'success' }>;
type PendingQueryResult<TData> = Extract<UseQueryResult<TData, Error>, { status: 'pending' }>;
type LoadingErrorQueryResult<TData> = Extract<UseQueryResult<TData, Error>, { isLoadingError: true }>;
type RefetchErrorQueryResult<TData> = Extract<UseQueryResult<TData, Error>, { isRefetchError: true }>;

// Fields shared by every variant of the discriminated union (i.e. everything
// except the discriminant fields themselves). Derived from the public
// `UseQueryResult` type so we never have to name react-query's internal
// per-variant interfaces.
type CommonQueryFields<TData> = Omit<
  SuccessQueryResult<TData>,
  | 'data'
  | 'error'
  | 'isError'
  | 'isPending'
  | 'isLoading'
  | 'isLoadingError'
  | 'isRefetchError'
  | 'isSuccess'
  | 'isPlaceholderData'
  | 'status'
  | 'promise'
  | 'refetch'
>;

function buildCommonQueryFields<TData>(): CommonQueryFields<TData> {
  return {
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isPaused: false,
    isRefetching: false,
    isStale: false,
    isEnabled: true,
    fetchStatus: 'idle',
  };
}

function defaultQueryRefetch<TData>(): UseQueryResult<TData, Error>['refetch'] {
  return () => {
    throw new Error('mockUseQueryResult: refetch was not provided in overrides');
  };
}

/**
 * Build a complete, internally-consistent `UseQueryResult<TData, Error>` mock.
 *
 * The discriminated-union state (status / isPending / isLoadingError / ...) is
 * derived from `overrides.isError` and `overrides.isLoading` so the result is
 * always coherent: `{ isError: true }` yields a real error state (status:
 * 'error', a non-null `error`, `isSuccess: false`); the default (no overrides)
 * is a success state.
 */
export function mockUseQueryResult<TData>(
  overrides: Partial<UseQueryResult<TData, Error>> = {},
): UseQueryResult<TData, Error> {
  const isError = overrides.isError ?? false;
  const isLoading = overrides.isLoading ?? false;
  const data = overrides.data;
  const refetch = overrides.refetch ?? defaultQueryRefetch<TData>();
  const common = buildCommonQueryFields<TData>();

  if (isError) {
    const error = overrides.error ?? new Error('mock query error');

    if (data === undefined) {
      const result: LoadingErrorQueryResult<TData> = {
        ...common,
        data: undefined,
        error,
        isError: true,
        isPending: false,
        isLoading: false,
        isLoadingError: true,
        isRefetchError: false,
        isSuccess: false,
        isPlaceholderData: false,
        status: 'error',
        promise: new Promise<TData>(() => {}),
        refetch,
      };
      return result;
    }

    const result: RefetchErrorQueryResult<TData> = {
      ...common,
      data,
      error,
      isError: true,
      isPending: false,
      isLoading: false,
      isLoadingError: false,
      isRefetchError: true,
      isSuccess: false,
      isPlaceholderData: false,
      status: 'error',
      promise: Promise.resolve(data),
      refetch,
    };
    return result;
  }

  if (isLoading) {
    const result: PendingQueryResult<TData> = {
      ...common,
      data: undefined,
      error: null,
      isError: false,
      isPending: true,
      isLoading: true,
      isLoadingError: false,
      isRefetchError: false,
      isSuccess: false,
      isPlaceholderData: false,
      status: 'pending',
      promise: new Promise<TData>(() => {}),
      refetch,
    };
    return result;
  }

  const successData = data as TData;
  const result: SuccessQueryResult<TData> = {
    ...common,
    data: successData,
    error: null,
    isError: false,
    isPending: false,
    isLoading: false,
    isLoadingError: false,
    isRefetchError: false,
    isSuccess: true,
    isPlaceholderData: false,
    status: 'success',
    promise: Promise.resolve(successData),
    refetch,
  };
  return result;
}

// ── useInfiniteQuery ─────────────────────────────────────────────────────────

type SuccessInfiniteQueryResult<TData> = Extract<UseInfiniteQueryResult<TData, Error>, { status: 'success' }>;
type PendingInfiniteQueryResult<TData> = Extract<UseInfiniteQueryResult<TData, Error>, { status: 'pending' }>;
type LoadingErrorInfiniteQueryResult<TData> = Extract<UseInfiniteQueryResult<TData, Error>, { isLoadingError: true }>;
type RefetchErrorInfiniteQueryResult<TData> = Extract<UseInfiniteQueryResult<TData, Error>, { isRefetchError: true }>;

type CommonInfiniteQueryFields<TData> = Omit<
  SuccessInfiniteQueryResult<TData>,
  | 'data'
  | 'error'
  | 'isError'
  | 'isPending'
  | 'isLoading'
  | 'isLoadingError'
  | 'isRefetchError'
  | 'isSuccess'
  | 'isPlaceholderData'
  | 'status'
  | 'promise'
  | 'refetch'
  | 'fetchNextPage'
  | 'fetchPreviousPage'
  | 'hasNextPage'
  | 'hasPreviousPage'
  | 'isFetchNextPageError'
  | 'isFetchingNextPage'
  | 'isFetchPreviousPageError'
  | 'isFetchingPreviousPage'
>;

function buildCommonInfiniteQueryFields<TData>(): CommonInfiniteQueryFields<TData> {
  return {
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isPaused: false,
    isRefetching: false,
    isStale: false,
    isEnabled: true,
    fetchStatus: 'idle',
  };
}

function defaultInfiniteQueryRefetch<TData>(): UseInfiniteQueryResult<TData, Error>['refetch'] {
  return () => {
    throw new Error('mockUseInfiniteQueryResult: refetch was not provided in overrides');
  };
}

function defaultFetchNextPage<TData>(): UseInfiniteQueryResult<TData, Error>['fetchNextPage'] {
  return () => {
    throw new Error('mockUseInfiniteQueryResult: fetchNextPage was not provided in overrides');
  };
}

function defaultFetchPreviousPage<TData>(): UseInfiniteQueryResult<TData, Error>['fetchPreviousPage'] {
  return () => {
    throw new Error('mockUseInfiniteQueryResult: fetchPreviousPage was not provided in overrides');
  };
}

/**
 * Build a complete, internally-consistent `UseInfiniteQueryResult<TData, Error>`
 * mock. See {@link mockUseQueryResult} for the consistency rules; this variant
 * additionally fills the infinite-query-only fields (fetchNextPage,
 * hasNextPage, isFetchingNextPage, ...).
 */
export function mockUseInfiniteQueryResult<TData>(
  overrides: Partial<UseInfiniteQueryResult<TData, Error>> = {},
): UseInfiniteQueryResult<TData, Error> {
  const isError = overrides.isError ?? false;
  const isLoading = overrides.isLoading ?? false;
  const data = overrides.data;
  const refetch = overrides.refetch ?? defaultInfiniteQueryRefetch<TData>();
  const fetchNextPage = overrides.fetchNextPage ?? defaultFetchNextPage<TData>();
  const fetchPreviousPage = overrides.fetchPreviousPage ?? defaultFetchPreviousPage<TData>();
  const hasNextPage = overrides.hasNextPage ?? false;
  const hasPreviousPage = overrides.hasPreviousPage ?? false;
  const isFetchingNextPage = overrides.isFetchingNextPage ?? false;
  const isFetchingPreviousPage = overrides.isFetchingPreviousPage ?? false;
  const common = buildCommonInfiniteQueryFields<TData>();

  if (isError) {
    const error = overrides.error ?? new Error('mock infinite query error');

    if (data === undefined) {
      const result: LoadingErrorInfiniteQueryResult<TData> = {
        ...common,
        data: undefined,
        error,
        isError: true,
        isPending: false,
        isLoading: false,
        isLoadingError: true,
        isRefetchError: false,
        isSuccess: false,
        isPlaceholderData: false,
        status: 'error',
        promise: new Promise<TData>(() => {}),
        refetch,
        fetchNextPage,
        fetchPreviousPage,
        hasNextPage,
        hasPreviousPage,
        isFetchNextPageError: false,
        isFetchingNextPage,
        isFetchPreviousPageError: false,
        isFetchingPreviousPage,
      };
      return result;
    }

    const result: RefetchErrorInfiniteQueryResult<TData> = {
      ...common,
      data,
      error,
      isError: true,
      isPending: false,
      isLoading: false,
      isLoadingError: false,
      isRefetchError: true,
      isSuccess: false,
      isPlaceholderData: false,
      status: 'error',
      promise: Promise.resolve(data),
      refetch,
      fetchNextPage,
      fetchPreviousPage,
      hasNextPage,
      hasPreviousPage,
      isFetchNextPageError: false,
      isFetchingNextPage,
      isFetchPreviousPageError: false,
      isFetchingPreviousPage,
    };
    return result;
  }

  if (isLoading) {
    const result: PendingInfiniteQueryResult<TData> = {
      ...common,
      data: undefined,
      error: null,
      isError: false,
      isPending: true,
      isLoading: true,
      isLoadingError: false,
      isRefetchError: false,
      isSuccess: false,
      isPlaceholderData: false,
      status: 'pending',
      promise: new Promise<TData>(() => {}),
      refetch,
      fetchNextPage,
      fetchPreviousPage,
      hasNextPage,
      hasPreviousPage,
      isFetchNextPageError: false,
      isFetchingNextPage,
      isFetchPreviousPageError: false,
      isFetchingPreviousPage,
    };
    return result;
  }

  const successData = data as TData;
  const result: SuccessInfiniteQueryResult<TData> = {
    ...common,
    data: successData,
    error: null,
    isError: false,
    isPending: false,
    isLoading: false,
    isLoadingError: false,
    isRefetchError: false,
    isSuccess: true,
    isPlaceholderData: false,
    status: 'success',
    promise: Promise.resolve(successData),
    refetch,
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage,
    hasPreviousPage,
    isFetchNextPageError: false,
    isFetchingNextPage,
    isFetchPreviousPageError: false,
    isFetchingPreviousPage,
  };
  return result;
}
