/**
 * areaSlug.test.ts — Unit tests for slugify() and slugifyFromAreaKey()
 *
 * These are SHARED vectors with the backend (AreaSlugTest.java).
 * Each test is named with the same SV-NN prefix to allow cross-referencing.
 * If a vector here changes, the backend suite must be updated too.
 */
import { describe, it, expect } from 'vitest';
import { slugify, slugifyFromAreaKey } from '@/lib/areaSlug';

describe('slugify — shared backend vectors', () => {
  it('SV-01: plain ASCII single word', () => {
    expect(slugify('Malpe')).toBe('malpe');
  });

  it('SV-02: two-word ASCII label with space', () => {
    expect(slugify('Udupi Town')).toBe('udupi-town');
  });

  it('SV-03: three-word ASCII label with spaces', () => {
    expect(slugify('Malpe Beach Road')).toBe('malpe-beach-road');
  });

  it('SV-04: diacritic — acute accent over e (Malpé → malpe)', () => {
    // NFKD decomposes 'é' → 'e' + combining acute (U+0301); \p{M} strips the mark
    expect(slugify('Malpé')).toBe('malpe');
  });

  it('SV-05: ligature fi (U+FB01) decomposes via NFKD to f+i', () => {
    // U+FB01 LATIN SMALL LIGATURE FI → NFKD → 'f' + 'i'
    expect(slugify('ﬁeld')).toBe('field');
  });

  it('SV-06: all-punctuation input yields empty string after trim', () => {
    expect(slugify('---')).toBe('');
  });

  it('SV-07: leading/trailing spaces are trimmed', () => {
    expect(slugify(' Beach Road ')).toBe('beach-road');
  });

  it('SV-08: consecutive spaces collapse to a single hyphen', () => {
    expect(slugify('Malpe  Beach')).toBe('malpe-beach');
  });

  it('locale independence: uppercase I stays i (not Turkish ı)', () => {
    expect(slugify('ISTANBUL')).toBe('istanbul');
  });
});

describe('slugifyFromAreaKey — shared backend vectors', () => {
  it('SV-09: null area_label fallback — last pipe segment', () => {
    // Java: AreaSlug.slugifyFromAreaKey("IN|KA|Udupi|Malpe") → "malpe"
    expect(slugifyFromAreaKey('IN|KA|Udupi|Malpe')).toBe('malpe');
  });

  it('SV-10: last segment with spaces', () => {
    // Java: AreaSlug.slugifyFromAreaKey("IN|KA|Udupi|Udupi Town") → "udupi-town"
    expect(slugifyFromAreaKey('IN|KA|Udupi|Udupi Town')).toBe('udupi-town');
  });
});
