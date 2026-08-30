import { describe, it, expect } from 'vitest';
import { escapeHtml } from './security';

describe('escapeHtml', () => {
  it('escapes < > " \' & characters in an XSS payload', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes single quote', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes double quote', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('returns plain string unchanged', () => {
    expect(escapeHtml('Udupi')).toBe('Udupi');
  });

  it('handles positive numeric input', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('handles zero', () => {
    expect(escapeHtml(0)).toBe('0');
  });

  it('handles negative number', () => {
    expect(escapeHtml(-1)).toBe('-1');
  });

  it('handles floating point number', () => {
    expect(escapeHtml(1234.56)).toBe('1234.56');
  });

  it('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('handles empty string input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles string containing multiple special characters', () => {
    expect(escapeHtml('1 < 2 & 3 > "four"')).toBe(
      '1 &lt; 2 &amp; 3 &gt; &quot;four&quot;',
    );
  });
});
