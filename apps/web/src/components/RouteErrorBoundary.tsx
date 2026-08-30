import type { ReactNode } from "react";
import * as Sentry from "@sentry/react";
import type { Scope } from "@sentry/core";

interface RouteErrorBoundaryProps {
  /** Bounded route-group tag (e.g. "public", "discover", "broker", "admin"). No PII. */
  group: string;
  children: ReactNode;
}

/**
 * Sentry `beforeCapture` handler: tags the event with a bounded `route_group`
 * value only. Exported so tests can exercise the exact tagging behaviour
 * without duplicating it. Deliberately never touches scope.setUser or any
 * other PII-carrying scope method.
 */
export function tagRouteGroup(scope: Pick<Scope, "setTag">, group: string): void {
  scope.setTag("route_group", group);
}

/**
 * Route-level error boundary. Wraps a group of routes so that an unhandled
 * render error in one route group does not take down the rest of the app
 * (the root Sentry.ErrorBoundary in src/main.tsx remains the outermost net).
 *
 * Tags the Sentry event with a bounded `route_group` value only — never adds
 * user identity or other PII to the scope.
 */
export function RouteErrorBoundary({ group, children }: RouteErrorBoundaryProps) {
  return (
    <Sentry.ErrorBoundary
      beforeCapture={(scope) => tagRouteGroup(scope, group)}
      fallback={() => (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
          <p className="text-lg font-medium">Something went wrong loading this page.</p>
          <a href="/" className="text-primary underline underline-offset-4">
            Go back to the homepage
          </a>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
