import { useEffect, useRef } from 'react';

/**
 * useMountEffect — runs `callback` exactly once, on mount, and never again,
 * regardless of how any values referenced inside `callback` change afterward.
 *
 * Equivalent to `useEffect(callback, [])`, but self-documenting: the intent
 * ("deliberately run once on mount, using whatever inputs are present at that
 * moment; re-running on later input changes would be wrong") is expressed by
 * the hook name instead of an opaque `// eslint-disable-next-line
 * react-hooks/exhaustive-deps` comment at every call site.
 *
 * Implementation note: the latest `callback` is captured in a ref and read
 * from inside a `useEffect(..., [])`. The effect body only reads ref values
 * (stable across renders), so react-hooks/exhaustive-deps has nothing to
 * flag — no suppression is needed here or at call sites. A `hasRunRef` guard
 * additionally protects against React 18 Strict Mode's dev-only
 * mount→cleanup→mount double-invoke, so `callback` truly fires once.
 *
 * Use this where an effect must seed/initialize state from mount-time props
 * and must NOT re-fire when those props change later. If the "run once" is
 * actually "run once after a condition becomes true" (not pure mount), use a
 * documented `useRef` guard at the call site instead — this helper is for the
 * pure-mount case only.
 */
export function useMountEffect(callback: () => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    callbackRef.current();
  }, []);
}
