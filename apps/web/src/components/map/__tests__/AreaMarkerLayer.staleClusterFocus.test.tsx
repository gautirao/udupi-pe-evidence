/**
 * AreaDestinationMarkerLayer — Issue #2088, BR8 + V-b.
 *
 * BR8 (D2_binding_requirements): a `clusterFocus` value is VALIDATED against
 * the currently selected node; a stale/invalid value — including one whose
 * member areaKeys belong to a DIFFERENT parent node entirely (e.g. a forged
 * URL, or navigating away and Back-ing into a stale link) — is safely
 * IGNORED and STRIPPED, never thrown, never rendered.
 *
 * V-b (issue-2088 orchestrator variance): the engineer's own account is that
 * this is satisfied by a PRE-EXISTING, UNMODIFIED `stillAllVisible` effect in
 * `AreaMarkerLayer.tsx` (the reconciliation block that compares
 * `focusedMembers` against the node's own VISIBLE member set and clears focus
 * when they diverge) — a claim that existing code satisfies an
 * owner-binding requirement, made on inspection. This file proves it
 * BEHAVIOURALLY instead: mount `AreaDestinationMarkerLayer` with a
 * `focusedClusterMemberAreaKeys` set naming areaKeys that are NOT children of
 * the CURRENT node at all (as if carried over from a different parent), and
 * assert (1) no throw, (2) no `console.error`, (3) nothing from the stale
 * set is ever highlighted/rendered as a cluster, and (4)
 * `onClusterFocusChange(null)` strips the stale value.
 *
 * Mocking strategy matches `AreaMarkerLayer.destinations.test.tsx` exactly
 * (same file, same mock shape) — reused rather than re-invented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

type CapturedMarker = {
  handlers: Record<string, (...args: unknown[]) => void>;
  addTo: ReturnType<typeof vi.fn>;
  getElement: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setLatLng: ReturnType<typeof vi.fn>;
  setIcon: ReturnType<typeof vi.fn>;
};
const capturedMarkers: CapturedMarker[] = [];
const divIconHtmlCalls: string[] = [];

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    divIcon: vi.fn((opts: { html: string; className: string }) => {
      divIconHtmlCalls.push(opts.html);
      return { options: opts };
    }),
    marker: vi.fn((latlng: [number, number]) => {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const el = document.createElement('div');
      el.innerHTML = '<div data-testid="area-marker-stub" tabindex="0" role="button"></div>';
      const instance: Record<string, unknown> = {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers[event] = cb;
          return instance;
        }),
        off: vi.fn(() => instance),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn(() => el),
        setLatLng: vi.fn(),
        setIcon: vi.fn((icon: { options: { html: string } }) => {
          el.innerHTML = icon.options.html;
        }),
      };
      capturedMarkers.push({
        handlers,
        addTo: instance.addTo as ReturnType<typeof vi.fn>,
        getElement: instance.getElement as ReturnType<typeof vi.fn>,
        remove: instance.remove as ReturnType<typeof vi.fn>,
        setLatLng: instance.setLatLng as ReturnType<typeof vi.fn>,
        setIcon: instance.setIcon as ReturnType<typeof vi.fn>,
      });
      return instance;
    }),
  },
}));

const panes = new Map<string, HTMLElement>();
const mapStub = {
  getSize: vi.fn(() => ({ x: 1200, y: 800 })),
  getZoom: vi.fn(() => 11),
  containerPointToLatLng: vi.fn(([x, y]: [number, number]) => ({ lat: 13 - y / 10000, lng: 77 + x / 10000 })),
  latLngToContainerPoint: vi.fn(([lat, lng]: [number, number]) => ({ x: (lng - 77) * 10000, y: (13 - lat) * 10000 })),
  getContainer: vi.fn(() => document.createElement('div')),
  on: vi.fn(),
  off: vi.fn(),
  getPane: vi.fn((name: string) => panes.get(name)),
  createPane: vi.fn((name: string) => {
    const pane = document.createElement('div');
    panes.set(name, pane);
    return pane;
  }),
};

vi.mock('react-leaflet', () => ({
  useMap: vi.fn(() => mapStub),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import React from 'react';
import { render } from '@testing-library/react';
import { AreaDestinationMarkerLayer } from '../AreaMarkerLayer';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import { AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS } from '@/features/discover/navigation/__fixtures__/candidateNavigationTree';

function makeChild(overrides: Partial<AreasNavigationChild> = {}): AreasNavigationChild {
  return {
    nodeKey: 'a:current-child',
    nodeType: 'AREA',
    displayLabel: 'Current Child',
    displayOrder: 0,
    listingCount: 4,
    schoolCount: null,
    isLeafArea: true,
    matchingAreaCount: null,
    ...overrides,
  };
}

const ROOT_NODE: NavigationNodeResponse = {
  nodeKey: 'd:e',
  nodeType: 'DIRECTION',
  displayLabel: 'East Bangalore',
  depth: 0,
  regionKey: 'EAST',
  ancestry: [],
  nextLevelType: 'AREA',
  children: [],
  revisionId: 1,
  bounds: null,
  descendantAreaKeys: null,
  areaKey: null,
};

// The CURRENT node's real children — deliberately NONE of these areaKeys
// overlap with AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS (the stale focus below),
// modelling "navigated to a different Direction/parent while an old
// clusterFocus= from a previous node is still sitting in the URL".
const CURRENT_NODE_RAW_CHILDREN: NavigationNodeResponse['children'] = [
  { nodeKey: 'a:whitefield', nodeType: 'AREA', displayLabel: 'Whitefield', displayOrder: 0, areaKey: 'IN|KA|Bengaluru|Whitefield', centreLat: 12.97, centreLon: 77.75 },
  { nodeKey: 'a:hoodi', nodeType: 'AREA', displayLabel: 'Hoodi', displayOrder: 1, areaKey: 'IN|KA|Bengaluru|Hoodi', centreLat: 12.99, centreLon: 77.71 },
];
const CURRENT_NODE_TYPED_CHILDREN: AreasNavigationChild[] = [
  makeChild({ nodeKey: 'a:whitefield', displayLabel: 'Whitefield', listingCount: 6 }),
  makeChild({ nodeKey: 'a:hoodi', displayLabel: 'Hoodi', listingCount: 4 }),
];

beforeEach(() => {
  capturedMarkers.length = 0;
  divIconHtmlCalls.length = 0;
  vi.clearAllMocks();
});

describe('AreaDestinationMarkerLayer — BR8/V-b: a clusterFocus carried over from a DIFFERENT parent is stripped, never rendered, never throws', () => {
  it('POSITIVE CONTROL — with NO stale focus, the two real current-node children render normally (proves the harness itself is not just empty)', () => {
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: CURRENT_NODE_RAW_CHILDREN }}
        levelKind="areas"
        children={CURRENT_NODE_TYPED_CHILDREN}
        onSelect={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(2);
  });

  it('a clusterFocus naming ONLY areaKeys absent from the current node does not throw and calls onClusterFocusChange(null) — the stale value is stripped', () => {
    const onClusterFocusChange = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let renderResult: ReturnType<typeof render> | undefined;
    expect(() => {
      renderResult = render(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: CURRENT_NODE_RAW_CHILDREN }}
          levelKind="areas"
          children={CURRENT_NODE_TYPED_CHILDREN}
          onSelect={vi.fn()}
          focusedClusterMemberAreaKeys={AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS}
          onClusterFocusChange={onClusterFocusChange}
        />,
      );
    }).not.toThrow();

    // No React error was logged (a real crash inside the effect would surface here).
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    // The stale focus is detected as not-fully-visible against the CURRENT
    // node's real children and cleared — never silently kept.
    expect(onClusterFocusChange).toHaveBeenCalledWith(null);

    renderResult?.unmount();
    consoleErrorSpy.mockRestore();
  });

  it('nothing from the stale (foreign-parent) focus set is ever rendered as a scoped/highlighted cluster — the clearing render paints no stale frame', () => {
    const onClusterFocusChange = vi.fn();
    render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: CURRENT_NODE_RAW_CHILDREN }}
        levelKind="areas"
        children={CURRENT_NODE_TYPED_CHILDREN}
        onSelect={vi.fn()}
        focusedClusterMemberAreaKeys={AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS}
        onClusterFocusChange={onClusterFocusChange}
      />,
    );
    // The stale-focus-detected render bails out BEFORE building any marker
    // for this run (the same "no stale/partial frame on the clearing
    // render" contract AC4.18's zero-content test already pins) — no divIcon
    // HTML mentions any of the foreign cluster's real area labels
    // (Avalahalli/Deepanjali Nagar), and no marker was ever constructed for
    // this node's OWN two real children on this particular run either (the
    // clearing bail-out returns before the desired-set loop runs at all).
    const allHtml = divIconHtmlCalls.join('\n');
    expect(allHtml).not.toMatch(/Avalahalli|Deepanjali/);
    expect(onClusterFocusChange).toHaveBeenCalledWith(null);
  });

  it('after the parent clears focus (real controlled re-render with focusedClusterMemberAreaKeys=null), the current node\'s own real children render normally — recovery, not a permanent break', () => {
    const { rerender } = render(
      <AreaDestinationMarkerLayer
        node={{ ...ROOT_NODE, children: CURRENT_NODE_RAW_CHILDREN }}
        levelKind="areas"
        children={CURRENT_NODE_TYPED_CHILDREN}
        onSelect={vi.fn()}
        focusedClusterMemberAreaKeys={AVALAHALLI_CLUSTER_MEMBER_AREA_KEYS}
        onClusterFocusChange={vi.fn()}
      />,
    );
    expect(capturedMarkers).toHaveLength(0);

    act(() => {
      rerender(
        <AreaDestinationMarkerLayer
          node={{ ...ROOT_NODE, children: CURRENT_NODE_RAW_CHILDREN }}
          levelKind="areas"
          children={CURRENT_NODE_TYPED_CHILDREN}
          onSelect={vi.fn()}
          focusedClusterMemberAreaKeys={null}
          onClusterFocusChange={vi.fn()}
        />,
      );
    });

    expect(capturedMarkers).toHaveLength(2);
  });
});
