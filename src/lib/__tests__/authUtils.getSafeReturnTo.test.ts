import { describe, it, expect } from 'vitest';
import { getSafeReturnTo } from '@/lib/authUtils';

describe('getSafeReturnTo', () => {
  describe('accepts safe same-app relative paths', () => {
    it('returns a simple relative path verbatim', () => {
      expect(getSafeReturnTo('/discover')).toBe('/discover');
    });

    it('preserves query string exactly', () => {
      expect(getSafeReturnTo('/discover?city=x&node=y')).toBe('/discover?city=x&node=y');
    });

    it('returns a nested relative path verbatim', () => {
      expect(getSafeReturnTo('/listing/123')).toBe('/listing/123');
    });
  });

  describe('rejects unsafe / non-relative input', () => {
    it('rejects null', () => {
      expect(getSafeReturnTo(null)).toBeNull();
    });

    it('rejects undefined', () => {
      expect(getSafeReturnTo(undefined)).toBeNull();
    });

    it('rejects empty string', () => {
      expect(getSafeReturnTo('')).toBeNull();
    });

    it('rejects a protocol-relative URL (//host)', () => {
      expect(getSafeReturnTo('//evil.com')).toBeNull();
    });

    it('rejects a /http-prefixed value', () => {
      expect(getSafeReturnTo('/http://evil.com')).toBeNull();
    });

    it('rejects a full https URL', () => {
      expect(getSafeReturnTo('https://evil.com')).toBeNull();
    });

    it('rejects a full http URL', () => {
      expect(getSafeReturnTo('http://evil.com')).toBeNull();
    });

    it('rejects a bare host with no leading slash', () => {
      expect(getSafeReturnTo('evil.com')).toBeNull();
    });
  });

  describe('hardened against open-redirect bypass variants (#2232)', () => {
    // Backslashes are normalised to forward slashes before validation, so a
    // leading "/\" is judged the same as "//" (protocol-relative) and rejected —
    // matching how browsers have historically normalised "/\" to "//".
    it('rejects a backslash-prefixed value', () => {
      expect(getSafeReturnTo('/\\evil.com')).toBeNull();
    });

    // Scheme detection is now case-insensitive, so an uppercase (or mixed-case)
    // scheme prefix is rejected just like the lowercase form.
    it('rejects an uppercase-scheme value', () => {
      expect(getSafeReturnTo('/HTTP://evil.com')).toBeNull();
    });

    it('rejects a mixed-case scheme value', () => {
      expect(getSafeReturnTo('/Https://evil.com')).toBeNull();
    });

    it('rejects each hostile variant listed in issue #2232', () => {
      const hostileVariants = [
        '/\\evil.com',
        '/\\/evil.com',
        '/HTTP://evil.com',
        '//evil.com',
        'https://evil.com',
      ];
      for (const hostile of hostileVariants) {
        expect(getSafeReturnTo(hostile)).toBeNull();
      }
    });

    // Security-review follow-up: a tab/CR/LF inside the scheme breaks the
    // contiguous-scheme-char regex, so these must be stripped before the
    // scheme check runs (matching the WHATWG URL parser's own stripping
    // behaviour) or the payload would otherwise pass through unrejected.
    it('rejects a scheme prefix split by an embedded tab character', () => {
      expect(getSafeReturnTo('/ht\ttp://evil.com')).toBeNull();
    });

    it('rejects a scheme prefix split by an embedded newline character', () => {
      expect(getSafeReturnTo('/ht\ntp://evil.com')).toBeNull();
    });

    it('rejects a scheme prefix split by an embedded carriage return', () => {
      expect(getSafeReturnTo('/ht\rtp://evil.com')).toBeNull();
    });

    it('rejects a javascript: scheme split by an embedded tab character', () => {
      expect(getSafeReturnTo('/java\tscript:alert(1)')).toBeNull();
    });
  });

  describe('additional edge cases (behaviour observed and labelled, not assumed)', () => {
    it('rejects a triple-slash value (starts with "//")', () => {
      // '///evil.com'.startsWith('//') === true -> rejected. Label: reject.
      expect(getSafeReturnTo('///evil.com')).toBeNull();
    });

    it('rejects a slash-backslash-slash value (normalises to "///evil.com")', () => {
      // '/\\/evil.com' normalises (backslash -> forward slash) to '///evil.com',
      // which starts with '//' -> rejected. Label: reject (#2232 hardening).
      expect(getSafeReturnTo('/\\/evil.com')).toBeNull();
    });

    it('passes a URL-encoded double-slash value through unchanged (guard checks literal chars, not decoded)', () => {
      // '/%2F%2Fevil.com' starts with '/', not literal '//', not '/http' -> accepted verbatim.
      // Label: accept. The encoded form is inert unless a downstream consumer decodes
      // and then re-interprets it as a URL before use.
      expect(getSafeReturnTo('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com');
    });

    it('rejects a leading-whitespace variant (does not start with "/")', () => {
      const hostile = `${String.fromCharCode(0x20)}//evil.com`;
      // Leading space means the string does not start with '/' -> falls through to null.
      // Label: reject.
      expect(getSafeReturnTo(hostile)).toBeNull();
    });

    it('rejects a leading-control-character variant (does not start with "/")', () => {
      const hostile = `${String.fromCharCode(0x00)}//evil.com`;
      // Leading NUL control character means the string does not start with '/'
      // -> falls through to null. Label: reject.
      expect(getSafeReturnTo(hostile)).toBeNull();
    });
  });
});
