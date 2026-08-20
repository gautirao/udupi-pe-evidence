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

  describe('current behaviour pinned (NOT asserted safe — see consumer-analysis annotations)', () => {
    // The string guard only checks for a leading '/', not-'//', not-'/http'.
    // A backslash after the leading slash passes the guard and IS returned as-is.
    // This is safe TODAY only because every consumer (Auth.tsx, AuthCallback.tsx) routes
    // the value through react-router's navigate() — which does not interpret backslashes
    // as scheme/host separators the way a raw `window.location.href = x` assignment would.
    // If any future consumer switched to a location assignment, this value could become
    // a live open redirect (browsers historically normalise leading `/\` to `//`).
    it('passes a backslash-prefixed value through unchanged (guard does not special-case backslash)', () => {
      expect(getSafeReturnTo('/\\evil.com')).toBe('/\\evil.com');
    });

    // The '/http' check is case-sensitive (String.prototype.startsWith has no
    // case-insensitive option), so an uppercase scheme bypasses the block-list entirely.
    // Same safety reasoning as above: safe only because consumption is via navigate(),
    // never a raw location assignment.
    it('passes an uppercase-scheme value through unchanged (guard is case-sensitive)', () => {
      expect(getSafeReturnTo('/HTTP://evil.com')).toBe('/HTTP://evil.com');
    });
  });

  describe('additional edge cases (behaviour observed and labelled, not assumed)', () => {
    it('rejects a triple-slash value (starts with "//")', () => {
      // '///evil.com'.startsWith('//') === true -> rejected. Label: reject.
      expect(getSafeReturnTo('///evil.com')).toBeNull();
    });

    it('passes a slash-backslash-slash value through unchanged (does not start with "//")', () => {
      // '/\\/evil.com' starts with '/', not '//', not '/http' -> accepted verbatim.
      // Label: accept (same backslash-normalisation caveat as above).
      expect(getSafeReturnTo('/\\/evil.com')).toBe('/\\/evil.com');
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
