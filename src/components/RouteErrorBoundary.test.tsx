import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteErrorBoundary, tagRouteGroup } from "./RouteErrorBoundary";

function Throwing(): JSX.Element {
  throw new Error("boom");
}

describe("RouteErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The AC2 isolation test intentionally throws inside React's render — React
    // logs this via console.error. Silence it so the expected throw isn't
    // mistaken for a test-env failure.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children on the success path with no fallback shown", () => {
    render(
      <RouteErrorBoundary group="public">
        <div>Hello</div>
      </RouteErrorBoundary>
    );

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("isolates a thrown error to its own group — sibling boundaries stay unaffected (AC2)", () => {
    // The throw must not propagate past the admin boundary and must not
    // affect the sibling discover boundary's render.
    expect(() =>
      render(
        <>
          <RouteErrorBoundary group="admin">
            <Throwing />
          </RouteErrorBoundary>
          <RouteErrorBoundary group="discover">
            <div>discover-ok</div>
          </RouteErrorBoundary>
        </>
      )
    ).not.toThrow();

    // (a) admin boundary shows its fallback
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    // (b) sibling discover boundary is unaffected
    expect(screen.getByText("discover-ok")).toBeInTheDocument();
  });

  it("tags route_group with the group value and adds no PII (AC4)", () => {
    // Exercises the exact beforeCapture logic RouteErrorBoundary wires up to
    // Sentry.ErrorBoundary (tagRouteGroup is what `beforeCapture` delegates
    // to), against a mock scope — deterministic, no real Sentry event needed.
    const setTag = vi.fn();
    const setUser = vi.fn();
    const mockScope = { setTag, setUser };

    tagRouteGroup(mockScope, "broker");

    expect(setTag).toHaveBeenCalledWith("route_group", "broker");
    expect(setTag).toHaveBeenCalledTimes(1);
    expect(setUser).not.toHaveBeenCalled();
  });
});
