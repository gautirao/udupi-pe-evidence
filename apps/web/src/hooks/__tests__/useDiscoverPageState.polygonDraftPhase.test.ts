import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { DiscoverUrlState, DiscoverUrlActions } from '../useDiscoverUrlState';
import type { PolygonScopeValidation } from '@/features/discover/state/validatePolygonScope';

const { mockValidatePolygonScope } = vi.hoisted(() => ({
  mockValidatePolygonScope: vi.fn<(...args: unknown[]) => Promise<PolygonScopeValidation>>(),
}));

vi.mock('@/features/discover/state/validatePolygonScope', () => ({
  validatePolygonScope: mockValidatePolygonScope,
}));

import { useDiscoverPageState } from '../useDiscoverPageState';

/**
 * Issue #2419 (PR-1) — the polygon draft state machine and the #2420
 * pre-commit contract.
 *
 * The load-bearing assertion throughout is on the SIDE EFFECT, not the
 * returned phase: `commitResultScope` is the only thing that writes the URL
 * and pushes history, so "an invalid draft creates no committed result-scope
 * history entry" is proven by that mock never being called — a phase value
 * alone would not prove it.
 */

const POLYGON: [number, number][] = [
  [12.9, 77.6],
  [13.0, 77.6],
  [13.0, 77.7],
];

const OTHER_POLYGON: [number, number][] = [
  [12.5, 77.1],
  [12.6, 77.1],
  [12.6, 77.2],
];

const COMMITTED_AREA_SET: DiscoverUrlState['resultScope'] = {
  active: { kind: 'AREA_SET', areaKeys: ['hebbal'] },
  previous: null,
};

function makeUrlState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'bangalore',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    ...overrides,
  } as DiscoverUrlState;
}

function makeUrlActions(): DiscoverUrlActions {
  return {
    changeCity: vi.fn(),
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
    setSchoolJourney: vi.fn(),
    setSearchQuery: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    setRegion: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(),
    setIntent: vi.fn(),
    commitResultScope: vi.fn(),
  } as unknown as DiscoverUrlActions;
}

/** Defaults to a signed-in shopper; the anonymous suite passes `false`. */
function renderPageState(
  urlState: DiscoverUrlState = makeUrlState(),
  isAuthenticated: boolean | undefined = true,
) {
  const urlActions = makeUrlActions();
  const view = renderHook(
    ({ urlState: current }: { urlState: DiscoverUrlState }) =>
      useDiscoverPageState({ urlState: current, urlActions, isAuthenticated }),
    { initialProps: { urlState } },
  );
  return { ...view, urlActions };
}

/** Never settles — models a probe still in flight. */
function pending(): Promise<PolygonScopeValidation> {
  return new Promise<PolygonScopeValidation>(() => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  mockValidatePolygonScope.mockResolvedValue({ outcome: 'valid' });
});

describe('useDiscoverPageState — polygon draft phase machine', () => {
  it('starts IDLE with no draft and no confirmation open', () => {
    const { result } = renderPageState();

    expect(result.current.polygonDraftPhase).toEqual({ status: 'IDLE' });
    expect(result.current.draftPolygon).toBeNull();
    expect(result.current.isReplaceScopeConfirmOpen).toBe(false);
    expect(result.current.polygonRejection).toBeNull();
  });

  it('derives COMMITTED from the URL-owned scope rather than local state', () => {
    const { result } = renderPageState(
      makeUrlState({
        resultScope: { active: { kind: 'POLYGON', coordinates: POLYGON }, previous: null },
      }),
    );

    expect(result.current.polygonDraftPhase).toEqual({ status: 'COMMITTED' });
  });

  it('enters REVIEWING while validating and commits nothing yet', async () => {
    mockValidatePolygonScope.mockReturnValue(pending());
    const { result, urlActions } = renderPageState();

    act(() => result.current.handlePolygonDrawn(POLYGON));

    expect(result.current.polygonDraftPhase).toEqual({
      status: 'REVIEWING',
      polygon: POLYGON,
      isValidating: true,
      awaitingReplaceConfirm: false,
    });
    expect(result.current.draftPolygon).toBe(POLYGON);
    expect(result.current.isReplaceScopeConfirmOpen).toBe(false);
    expect(urlActions.commitResultScope).not.toHaveBeenCalled();
  });

  it('validates the DRAFT polygon against the resolved city before committing', async () => {
    const { result } = renderPageState(makeUrlState({ city: 'bangalore' }));

    await act(async () => {
      result.current.handlePolygonDrawn(POLYGON);
    });

    expect(mockValidatePolygonScope).toHaveBeenCalledTimes(1);
    expect(mockValidatePolygonScope).toHaveBeenCalledWith('bangalore', POLYGON);
  });

  it.each([
    ['too_broad' as const],
    ['outside_searchable_city' as const],
  ])('a %s rejection never writes the URL and never touches the previous scope', async (reason) => {
    mockValidatePolygonScope.mockResolvedValue({ outcome: 'rejected', rejection: { reason } });
    const { result, urlActions } = renderPageState(makeUrlState({ resultScope: COMMITTED_AREA_SET }));

    await act(async () => {
      result.current.handlePolygonDrawn(POLYGON);
    });

    // The single fact that matters: nothing was committed, so no history
    // entry exists and the AREA_SET scope still owns the results.
    expect(urlActions.commitResultScope).not.toHaveBeenCalled();
    expect(result.current.resultScope.active).toEqual({ kind: 'AREA_SET', areaKeys: ['hebbal'] });
    expect(result.current.polygonDraftPhase).toEqual({
      status: 'INVALID',
      polygon: POLYGON,
      block: { kind: 'policy', rejection: { reason } },
    });
    expect(result.current.polygonRejection).toEqual({ reason });
    // The replace dialog must not open over a rejected draft.
    expect(result.current.isReplaceScopeConfirmOpen).toBe(false);
  });

  it('commits directly when the draft is valid and nothing was committed before', async () => {
    const { result, urlActions } = renderPageState();

    await act(async () => {
      result.current.handlePolygonDrawn(POLYGON);
    });

    expect(urlActions.commitResultScope).toHaveBeenCalledTimes(1);
    expect(urlActions.commitResultScope).toHaveBeenCalledWith({
      kind: 'POLYGON',
      coordinates: POLYGON,
    });
    expect(result.current.polygonDraftPhase).toEqual({ status: 'IDLE' });
  });

  it('opens the J3.3 replace confirmation instead of committing when a scope is already active', async () => {
    const { result, urlActions } = renderPageState(makeUrlState({ resultScope: COMMITTED_AREA_SET }));

    await act(async () => {
      result.current.handlePolygonDrawn(POLYGON);
    });

    expect(urlActions.commitResultScope).not.toHaveBeenCalled();
    expect(result.current.isReplaceScopeConfirmOpen).toBe(true);
    expect(result.current.polygonDraftPhase).toEqual({
      status: 'REVIEWING',
      polygon: POLYGON,
      isValidating: false,
      awaitingReplaceConfirm: true,
    });
  });

  it('commits exactly one POLYGON scope on confirm', async () => {
    const { result, urlActions } = renderPageState(makeUrlState({ resultScope: COMMITTED_AREA_SET }));

    await act(async () => {
      result.current.handlePolygonDrawn(POLYGON);
    });
    act(() => result.current.handleConfirmReplaceScope());

    expect(urlActions.commitResultScope).toHaveBeenCalledTimes(1);
    expect(urlActions.commitResultScope).toHaveBeenCalledWith({
      kind: 'POLYGON',
      coordinates: POLYGON,
    });
    expect(result.current.polygonDraftPhase).toEqual({ status: 'IDLE' });
  });

  it('commits nothing on cancel and leaves the prior scope intact', async () => {
    const { result, urlActions } = renderPageState(makeUrlState({ resultScope: COMMITTED_AREA_SET }));

    await act(async () => {
      result.current.handlePolygonDrawn(POLYGON);
    });
    act(() => result.current.handleCancelReplaceScope());

    expect(urlActions.commitResultScope).not.toHaveBeenCalled();
    expect(result.current.polygonDraftPhase).toEqual({ status: 'IDLE' });
    expect(result.current.resultScope.active).toEqual({ kind: 'AREA_SET', areaKeys: ['hebbal'] });
  });

  // A confirm that arrives while the draft is rejected (or still validating)
  // must not sneak an unvalidated polygon into the URL.
  it('refuses to commit a rejected draft even if confirm is invoked', async () => {
    mockValidatePolygonScope.mockResolvedValue({
      outcome: 'rejected',
      rejection: { reason: 'too_broad' },
    });
    const { result, urlActions } = renderPageState(makeUrlState({ resultScope: COMMITTED_AREA_SET }));

    await act(async () => {
      result.current.handlePolygonDrawn(POLYGON);
    });
    act(() => result.current.handleConfirmReplaceScope());

    expect(urlActions.commitResultScope).not.toHaveBeenCalled();
  });

  /**
   * PR review at head 9f061dcc, MUST-HAVE. The probe endpoint is
   * authenticated, so an unobtainable verdict is the NORMAL anonymous path,
   * not an edge case. An earlier revision let it through and committed — these
   * are the regressions for that.
   */
  describe('an unobtainable verdict fails closed', () => {
    it.each([
      ['an anonymous shopper (401)', false],
      ['a transient network or 5xx failure', true],
    ])('never writes the URL or history for %s', async (_label, retryable) => {
      mockValidatePolygonScope.mockResolvedValue({
        outcome: 'unverified',
        retryable,
        error: new Error('probe failed'),
      });
      const { result, urlActions } = renderPageState(makeUrlState({ resultScope: COMMITTED_AREA_SET }));

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });

      expect(urlActions.commitResultScope).not.toHaveBeenCalled();
      expect(result.current.resultScope.active).toEqual({ kind: 'AREA_SET', areaKeys: ['hebbal'] });
      expect(result.current.polygonDraftBlock).toEqual({ kind: 'unverified', retryable });
      expect(result.current.isReplaceScopeConfirmOpen).toBe(false);
    });

    // Also true with NO prior scope: "nothing committed" must stay nothing
    // committed rather than falling through to the direct-commit branch.
    it('never commits a first-ever polygon when the verdict is unobtainable', async () => {
      mockValidatePolygonScope.mockResolvedValue({
        outcome: 'unverified',
        retryable: false,
        error: new Error('401'),
      });
      const { result, urlActions } = renderPageState();

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });

      expect(urlActions.commitResultScope).not.toHaveBeenCalled();
      expect(result.current.polygonDraftPhase.status).toBe('INVALID');
    });

    // Telling a shopper to "draw a smaller area" when the app never got a
    // verdict would be a lie, so the #2420-only view stays null.
    it('is never reported as a #2420 rejection', async () => {
      mockValidatePolygonScope.mockResolvedValue({
        outcome: 'unverified',
        retryable: true,
        error: new Error('boom'),
      });
      const { result } = renderPageState();

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });

      expect(result.current.polygonRejection).toBeNull();
      expect(result.current.polygonDraftBlock?.kind).toBe('unverified');
    });

    it('can be retried, and commits once the retry succeeds', async () => {
      mockValidatePolygonScope
        .mockResolvedValueOnce({ outcome: 'unverified', retryable: true, error: new Error('5xx') })
        .mockResolvedValueOnce({ outcome: 'valid' });
      const { result, urlActions } = renderPageState();

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });
      expect(urlActions.commitResultScope).not.toHaveBeenCalled();

      await act(async () => {
        result.current.handleRetryPolygonValidation();
      });

      expect(urlActions.commitResultScope).toHaveBeenCalledTimes(1);
      expect(urlActions.commitResultScope).toHaveBeenCalledWith({
        kind: 'POLYGON',
        coordinates: POLYGON,
      });
    });

    // Retrying a 401 changes nothing until the shopper signs in, and retrying
    // a policy rejection needs a different shape — neither should re-probe.
    it.each([
      [
        'a non-retryable unverified block',
        { outcome: 'unverified', retryable: false, error: new Error('401') },
      ],
      [
        'a #2420 policy rejection',
        { outcome: 'rejected', rejection: { reason: 'too_broad' } },
      ],
    ])('does not re-probe for %s', async (_label, validation) => {
      mockValidatePolygonScope.mockResolvedValue(validation as never);
      const { result } = renderPageState();

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });
      expect(mockValidatePolygonScope).toHaveBeenCalledTimes(1);

      await act(async () => {
        result.current.handleRetryPolygonValidation();
      });

      expect(mockValidatePolygonScope).toHaveBeenCalledTimes(1);
    });
  });

  // Without the sequence guard the FIRST probe's verdict lands on the SECOND
  // draft — the shopper redraws a smaller area and is still told it is too big.
  it('discards a stale probe verdict once a newer draft supersedes it', async () => {
    let settleFirst: (v: PolygonScopeValidation) => void = () => {};
    mockValidatePolygonScope
      .mockReturnValueOnce(new Promise<PolygonScopeValidation>((resolve) => { settleFirst = resolve; }))
      .mockResolvedValueOnce({ outcome: 'valid' });

    const { result, urlActions } = renderPageState();

    act(() => result.current.handlePolygonDrawn(POLYGON));
    await act(async () => {
      result.current.handlePolygonDrawn(OTHER_POLYGON);
    });

    // The second draft already committed. Now the first probe finally rejects.
    await act(async () => {
      settleFirst({ outcome: 'rejected', rejection: { reason: 'too_broad' } });
    });

    expect(result.current.polygonRejection).toBeNull();
    expect(urlActions.commitResultScope).toHaveBeenCalledTimes(1);
    expect(urlActions.commitResultScope).toHaveBeenCalledWith({
      kind: 'POLYGON',
      coordinates: OTHER_POLYGON,
    });
  });

  it('dismissing a rejection returns to IDLE without touching the committed scope', async () => {
    mockValidatePolygonScope.mockResolvedValue({
      outcome: 'rejected',
      rejection: { reason: 'too_broad' },
    });
    const { result, urlActions } = renderPageState(makeUrlState({ resultScope: COMMITTED_AREA_SET }));

    await act(async () => {
      result.current.handlePolygonDrawn(POLYGON);
    });
    act(() => result.current.handleDismissPolygonRejection());

    expect(result.current.polygonDraftPhase).toEqual({ status: 'IDLE' });
    expect(urlActions.commitResultScope).not.toHaveBeenCalled();
  });

  it('Redraw moves to DRAWING and commits nothing on its own', async () => {
    mockValidatePolygonScope.mockResolvedValue({
      outcome: 'rejected',
      rejection: { reason: 'too_broad' },
    });
    const { result, urlActions } = renderPageState(makeUrlState({ resultScope: COMMITTED_AREA_SET }));

    await act(async () => {
      result.current.handlePolygonDrawn(POLYGON);
    });
    act(() => result.current.handleRedrawPolygon());

    expect(result.current.polygonDraftPhase).toEqual({ status: 'DRAWING' });
    expect(urlActions.commitResultScope).not.toHaveBeenCalled();
    expect(result.current.resultScope.active).toEqual({ kind: 'AREA_SET', areaKeys: ['hebbal'] });
  });

  // A draft in progress must win over the committed label, so the shopper
  // sees the shape they are working on rather than the one behind it.
  it('shows the live draft phase rather than COMMITTED while redrawing over a committed polygon', async () => {
    mockValidatePolygonScope.mockReturnValue(pending());
    const { result } = renderPageState(
      makeUrlState({
        resultScope: { active: { kind: 'POLYGON', coordinates: POLYGON }, previous: null },
      }),
    );

    expect(result.current.polygonDraftPhase.status).toBe('COMMITTED');

    act(() => result.current.handlePolygonDrawn(OTHER_POLYGON));

    expect(result.current.polygonDraftPhase.status).toBe('REVIEWING');
  });

  it('clearing abandons an in-flight probe and clears only a POLYGON scope', async () => {
    let settle: (v: PolygonScopeValidation) => void = () => {};
    mockValidatePolygonScope.mockReturnValue(
      new Promise<PolygonScopeValidation>((resolve) => { settle = resolve; }),
    );
    const { result, urlActions } = renderPageState(
      makeUrlState({
        resultScope: { active: { kind: 'POLYGON', coordinates: POLYGON }, previous: null },
      }),
    );

    act(() => result.current.handlePolygonDrawn(OTHER_POLYGON));
    act(() => result.current.handlePolygonCleared());

    expect(urlActions.commitResultScope).toHaveBeenCalledTimes(1);
    expect(urlActions.commitResultScope).toHaveBeenCalledWith(null);

    await act(async () => {
      settle({ outcome: 'rejected', rejection: { reason: 'too_broad' } });
    });

    await waitFor(() => expect(result.current.polygonDraftPhase.status).toBe('COMMITTED'));
    expect(result.current.polygonRejection).toBeNull();
  });

  /**
   * PR review at head aa5ab9e8. The #2420 probe is asynchronous, and the
   * committed scope can change underneath it via Back/Forward, a clear, or a
   * restore. Deciding "replace or commit directly?" from the scope as it stood
   * when drawing FINISHED — rather than as it stands when the verdict ARRIVES
   * — breaks #2016's single-owner contract in both directions.
   */
  describe('the post-validation decision uses the CURRENT committed scope', () => {
    it('requires replace confirmation when a scope appears while the probe is in flight', async () => {
      let settle: (v: PolygonScopeValidation) => void = () => {};
      mockValidatePolygonScope.mockReturnValue(
        new Promise<PolygonScopeValidation>((resolve) => { settle = resolve; }),
      );

      // Drawing starts with NO committed scope.
      const { result, rerender, urlActions } = renderPageState(makeUrlState());
      act(() => result.current.handlePolygonDrawn(POLYGON));

      // Back/Forward or a restore brings an AREA_SET back mid-probe.
      rerender({ urlState: makeUrlState({ resultScope: COMMITTED_AREA_SET }) });

      await act(async () => {
        settle({ outcome: 'valid' });
      });

      // Without the current-scope read this committed directly and skipped
      // J3.3 entirely, silently replacing an AREA_SET with no confirmation.
      expect(urlActions.commitResultScope).not.toHaveBeenCalled();
      expect(result.current.isReplaceScopeConfirmOpen).toBe(true);
    });

    it('commits directly when the scope disappears while the probe is in flight', async () => {
      let settle: (v: PolygonScopeValidation) => void = () => {};
      mockValidatePolygonScope.mockReturnValue(
        new Promise<PolygonScopeValidation>((resolve) => { settle = resolve; }),
      );

      // Drawing starts WITH a committed AREA_SET.
      const { result, rerender, urlActions } = renderPageState(
        makeUrlState({ resultScope: COMMITTED_AREA_SET }),
      );
      act(() => result.current.handlePolygonDrawn(POLYGON));

      // The shopper clears it mid-probe.
      rerender({ urlState: makeUrlState({ resultScope: { active: null, previous: null } }) });

      await act(async () => {
        settle({ outcome: 'valid' });
      });

      // Without the current-scope read this opened a replace dialog naming a
      // scope that no longer existed.
      expect(result.current.isReplaceScopeConfirmOpen).toBe(false);
      expect(urlActions.commitResultScope).toHaveBeenCalledTimes(1);
      expect(urlActions.commitResultScope).toHaveBeenCalledWith({
        kind: 'POLYGON',
        coordinates: POLYGON,
      });
    });
  });

  /**
   * Main Agent ruling (owner informed): drawn-area search is a signed-in
   * capability in PR-1, because the anonymous results path never sends
   * `polygon` and an anonymous commit would show a "Drawn area" chip over
   * results that were never scoped to the drawn area.
   *
   * The four paths below are the whole contract in one place.
   */
  describe('signed-in gate — the four commit paths', () => {
    it('anonymous: blocks before any probe, writes no URL and no history', async () => {
      const { result, urlActions } = renderPageState(
        makeUrlState({ resultScope: COMMITTED_AREA_SET }),
        false,
      );

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });

      // No request at all — not a request that happened to be refused.
      // Probing first would send a call for a capability this shopper cannot
      // use, and its 401 would be reported as a transport failure.
      expect(mockValidatePolygonScope).not.toHaveBeenCalled();
      expect(urlActions.commitResultScope).not.toHaveBeenCalled();
      expect(result.current.resultScope.active).toEqual({ kind: 'AREA_SET', areaKeys: ['hebbal'] });
      expect(result.current.polygonDraftBlock).toEqual({ kind: 'signed_in_required' });
      // Not a #2420 verdict: the drawing was never judged.
      expect(result.current.polygonRejection).toBeNull();
      expect(result.current.isReplaceScopeConfirmOpen).toBe(false);
    });

    it('signed in + valid: exactly one committed scope', async () => {
      const { result, urlActions } = renderPageState(makeUrlState(), true);

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });

      expect(mockValidatePolygonScope).toHaveBeenCalledTimes(1);
      expect(urlActions.commitResultScope).toHaveBeenCalledTimes(1);
      expect(urlActions.commitResultScope).toHaveBeenCalledWith({
        kind: 'POLYGON',
        coordinates: POLYGON,
      });
    });

    it('signed in + #2420 rejection: policy block, nothing committed', async () => {
      mockValidatePolygonScope.mockResolvedValue({
        outcome: 'rejected',
        rejection: { reason: 'too_broad' },
      });
      const { result, urlActions } = renderPageState(makeUrlState(), true);

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });

      expect(urlActions.commitResultScope).not.toHaveBeenCalled();
      expect(result.current.polygonDraftBlock).toEqual({
        kind: 'policy',
        rejection: { reason: 'too_broad' },
      });
    });

    it('signed in + 5xx: retryable unverified block, nothing committed', async () => {
      mockValidatePolygonScope.mockResolvedValue({
        outcome: 'unverified',
        retryable: true,
        error: new Error('503'),
      });
      const { result, urlActions } = renderPageState(makeUrlState(), true);

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });

      expect(urlActions.commitResultScope).not.toHaveBeenCalled();
      expect(result.current.polygonDraftBlock).toEqual({ kind: 'unverified', retryable: true });
    });

    // The composition passes `undefined` while auth is still resolving,
    // because its `isAuthenticated` reads `false` during that window even for
    // a signed-in shopper. Blocking on unknown would flash a sign-in demand at
    // someone who is already signed in.
    it('unknown auth state does not block', async () => {
      const { result, urlActions } = renderPageState(makeUrlState(), undefined);

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });

      expect(mockValidatePolygonScope).toHaveBeenCalledTimes(1);
      expect(urlActions.commitResultScope).toHaveBeenCalledTimes(1);
    });
  });

  it('clearing never clears an unrelated committed AREA_SET', () => {
    const { result, urlActions } = renderPageState(makeUrlState({ resultScope: COMMITTED_AREA_SET }));

    act(() => result.current.handlePolygonCleared());

    expect(urlActions.commitResultScope).not.toHaveBeenCalled();
  });

  /**
   * Issue #2419 (PR-3) — the auth gate moves from commit-time to draw-ENTRY
   * time. Both entry points (`handleRedrawPolygon`, `handleStartDrawPolygon`)
   * set the same DRAWING phase via the same empty-dep `useCallback`, so this
   * is the whole bug class: fixing one and leaving the other is the failure
   * mode this suite exists to catch.
   */
  describe('draw-entry gate — Redraw and Draw search area', () => {
    it.each([
      ['handleRedrawPolygon' as const],
      ['handleStartDrawPolygon' as const],
    ])('anonymous: %s is undefined and never enters DRAWING', (handlerName) => {
      const { result, urlActions } = renderPageState(
        makeUrlState({ resultScope: COMMITTED_AREA_SET }),
        false,
      );

      expect(result.current[handlerName]).toBeUndefined();
      expect(result.current.polygonDraftPhase).toEqual({ status: 'IDLE' });
      expect(result.current.startDrawNonce).toBe(0);
      expect(urlActions.commitResultScope).not.toHaveBeenCalled();
    });

    it.each([
      ['handleRedrawPolygon' as const],
      ['handleStartDrawPolygon' as const],
    ])('signed in: %s is a function that enters DRAWING and increments the nonce', (handlerName) => {
      const { result } = renderPageState(makeUrlState(), true);
      const beforeNonce = result.current.startDrawNonce;

      const handler = result.current[handlerName];
      expect(handler).toBeTypeOf('function');
      act(() => handler?.());

      expect(result.current.polygonDraftPhase).toEqual({ status: 'DRAWING' });
      expect(result.current.startDrawNonce).toBe(beforeNonce + 1);
    });

    // The composition passes `undefined` while auth is still resolving. If
    // that gated the draw-entry seams too, a signed-in shopper would see
    // Redraw/"Draw search area" blink out for a moment on every load.
    it.each([
      ['handleRedrawPolygon' as const],
      ['handleStartDrawPolygon' as const],
    ])('unknown auth state: %s stays wired (permissive-unknown, no blink-out)', (handlerName) => {
      const { result } = renderPageState(makeUrlState(), undefined);
      const beforeNonce = result.current.startDrawNonce;

      const handler = result.current[handlerName];
      expect(handler).toBeTypeOf('function');
      act(() => handler?.());

      expect(result.current.polygonDraftPhase).toEqual({ status: 'DRAWING' });
      expect(result.current.startDrawNonce).toBe(beforeNonce + 1);
    });

    it('anonymous: the previously committed scope is left untouched (no commit, no URL write)', () => {
      const { result, urlActions } = renderPageState(
        makeUrlState({ resultScope: COMMITTED_AREA_SET }),
        false,
      );

      expect(result.current.handleRedrawPolygon).toBeUndefined();
      expect(result.current.handleStartDrawPolygon).toBeUndefined();
      expect(result.current.resultScope.active).toEqual({ kind: 'AREA_SET', areaKeys: ['hebbal'] });
      expect(urlActions.commitResultScope).not.toHaveBeenCalled();
    });

    // Signed-in invalid-polygon flow end to end: handlePolygonDrawn -> INVALID
    // -> handleRedrawPolygon -> back to DRAWING. Guards the interaction of the
    // #2420 commit-time gate (still in place, line ~526) with the new
    // entry-time gate.
    it('signed in: invalid-polygon flow recovers via Redraw back to DRAWING', async () => {
      mockValidatePolygonScope.mockResolvedValue({
        outcome: 'rejected',
        rejection: { reason: 'too_broad' },
      });
      const { result } = renderPageState(makeUrlState(), true);

      await act(async () => {
        result.current.handlePolygonDrawn(POLYGON);
      });
      expect(result.current.polygonDraftPhase.status).toBe('INVALID');

      const redraw = result.current.handleRedrawPolygon;
      expect(redraw).toBeTypeOf('function');
      act(() => redraw?.());

      expect(result.current.polygonDraftPhase).toEqual({ status: 'DRAWING' });
    });
  });
});
