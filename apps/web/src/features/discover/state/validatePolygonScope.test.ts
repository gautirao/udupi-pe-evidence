import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get: mockGet } };
});

import { ApiError } from '@/lib/api';
import { validatePolygonScope } from './validatePolygonScope';

const POLYGON: [number, number][] = [
  [12.9, 77.6],
  [13.0, 77.6],
  [13.0, 77.7],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validatePolygonScope', () => {
  it('sends only the city, the draft polygon and a minimal page size', async () => {
    mockGet.mockResolvedValue({});

    await validatePolygonScope('bangalore', POLYGON);

    const [path] = mockGet.mock.calls[0] as [string];
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('city')).toBe('bangalore');
    expect(JSON.parse(params.get('polygon') ?? 'null')).toEqual(POLYGON);
    expect(params.get('size')).toBe('1');

    // ResultScopeExclusivity rejects more than one active result scope with
    // `result_scope_must_be_exclusive`. A probe that also carried the
    // committed AREA_SET would fail for that reason and be misread as a
    // problem with the shopper's drawing.
    expect(params.get('areaKeys')).toBeNull();
    expect(params.get('nodeKey')).toBeNull();
    expect(params.get('viewportScope')).toBeNull();
  });

  it('reports a clean response as valid', async () => {
    mockGet.mockResolvedValue({});

    expect(await validatePolygonScope('bangalore', POLYGON)).toEqual({ outcome: 'valid' });
  });

  it.each([
    ['polygon_scope_too_broad', 'too_broad'],
    ['polygon_outside_searchable_city', 'outside_searchable_city'],
  ])('reports %s as a typed policy rejection', async (serverCode, reason) => {
    mockGet.mockRejectedValue(new ApiError('bad request', 400, { error: serverCode }));

    expect(await validatePolygonScope('bangalore', POLYGON)).toEqual({
      outcome: 'rejected',
      rejection: { reason },
    });
  });

  /**
   * PR review at head 9f061dcc, MUST-HAVE. This endpoint is authenticated, so
   * 401 is the normal anonymous outcome. It must never be reported as valid.
   */
  it.each([
    ['401 unauthorised', 401],
    ['403 forbidden', 403],
  ])('reports %s as unverified and NOT retryable', async (_label, status) => {
    mockGet.mockRejectedValue(new ApiError('denied', status, { error: 'nope' }));

    const result = await validatePolygonScope('bangalore', POLYGON);
    expect(result.outcome).toBe('unverified');
    expect(result).toMatchObject({ retryable: false });
  });

  it.each([
    ['a 500', new ApiError('server error', 500, {})],
    ['a network failure', new Error('Failed to fetch')],
    ['an unrelated 400', new ApiError('bad request', 400, { error: 'INVALID_ARGUMENT' })],
  ])('reports %s as unverified and retryable', async (_label, error) => {
    mockGet.mockRejectedValue(error);

    const result = await validatePolygonScope('bangalore', POLYGON);
    expect(result.outcome).toBe('unverified');
    expect(result).toMatchObject({ retryable: true });
  });

  // The whole point of the probe: it must never report success it did not get.
  it('never reports valid for any failure', async () => {
    for (const error of [
      new ApiError('denied', 401, {}),
      new ApiError('server error', 503, {}),
      new Error('Failed to fetch'),
      'not even an Error',
    ]) {
      mockGet.mockRejectedValue(error);
      expect((await validatePolygonScope('bangalore', POLYGON)).outcome).not.toBe('valid');
    }
  });
});
