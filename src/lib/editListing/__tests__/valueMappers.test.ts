import { describe, expect, it } from 'vitest';
import {
  boolToTriState,
  triStateToBool,
  extractYouTubeId,
  isInstagramUrl,
  validateVideoUrl,
} from '../valueMappers';

describe('boolToTriState', () => {
  it.each([
    [true, 'true'],
    [false, 'false'],
    [null, ''],
    [undefined, ''],
  ] as const)('boolToTriState(%s) -> %s', (input, expected) => {
    expect(boolToTriState(input)).toBe(expected);
  });
});

describe('triStateToBool', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['', undefined],
    ['junk', undefined],
  ] as const)('triStateToBool(%s) -> %s', (input, expected) => {
    expect(triStateToBool(input)).toBe(expected);
  });
});

describe('boolToTriState / triStateToBool round-trip', () => {
  it.each([true, false, null, undefined] as const)('round-trips %s', (value) => {
    expect(triStateToBool(boolToTriState(value))).toBe(value ?? undefined);
  });
});

describe('extractYouTubeId', () => {
  it.each([
    ['https://youtu.be/abc123', 'abc123'],
    ['https://youtube.com/watch?v=xyz', 'xyz'],
    ['https://example.com', null],
  ] as const)('extractYouTubeId(%s) -> %s', (input, expected) => {
    expect(extractYouTubeId(input)).toBe(expected);
  });
});

describe('isInstagramUrl', () => {
  it.each([
    ['https://instagram.com/reel/abc123', true],
    ['https://instagram.com/p/abc123', true],
    ['https://youtu.be/abc123', false],
  ] as const)('isInstagramUrl(%s) -> %s', (input, expected) => {
    expect(isInstagramUrl(input)).toBe(expected);
  });
});

describe('validateVideoUrl', () => {
  it('returns null for an empty string', () => {
    expect(validateVideoUrl('')).toBeNull();
  });

  it('returns null for a valid YouTube URL', () => {
    expect(validateVideoUrl('https://www.youtube.com/watch?v=xyz')).toBeNull();
  });

  it('returns null for a valid Instagram reel URL', () => {
    expect(validateVideoUrl('https://www.instagram.com/reel/abc123')).toBeNull();
  });

  it('returns the exact error string for a non-matching URL', () => {
    expect(validateVideoUrl('https://example.com/video')).toBe(
      'Please enter a YouTube or Instagram Reel URL',
    );
  });
});
