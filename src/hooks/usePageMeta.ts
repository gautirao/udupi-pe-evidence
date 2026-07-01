import { useEffect } from 'react';

export const APP_SITE_NAME = 'Udupi Property Explorer';

export interface PageMetaOptions {
  title: string;
  description: string;
  /** og:title — omit to skip OG tag */
  ogTitle?: string;
  /** og:description — omit to skip OG tag */
  ogDescription?: string;
}

/** Create or update a <meta> element by attribute selector. */
function upsertMeta(attr: string, attrValue: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${attrValue}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Sets document.title and meta description (+ optional OG tags) on mount/update.
 * No third-party library required — updates the DOM directly.
 *
 * Call unconditionally at the top of a page component (Rules of Hooks).
 */
export function usePageMeta({
  title,
  description,
  ogTitle,
  ogDescription,
}: PageMetaOptions): void {
  useEffect(() => {
    document.title = title;
    upsertMeta('name', 'description', description);
    if (ogTitle != null) {
      upsertMeta('property', 'og:title', ogTitle);
    }
    if (ogDescription != null) {
      upsertMeta('property', 'og:description', ogDescription);
    }
  }, [title, description, ogTitle, ogDescription]);
}
