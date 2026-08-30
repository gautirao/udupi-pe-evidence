import type { NavigationNodeResponse } from '@/features/discover/navigation/types';
import type { AreasNavigationChild } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { CameraIntent } from '@/hooks/useDiscoverMapData';

export type HierarchyExtent = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

export function getHierarchyExtent(node: NavigationNodeResponse | null | undefined): HierarchyExtent | null {
  if (!node) return null;
  let minLat = node.bounds?.minLat ?? node.bounds?.centreLat ?? null;
  let maxLat = node.bounds?.maxLat ?? node.bounds?.centreLat ?? null;
  let minLon = node.bounds?.minLon ?? node.bounds?.centreLon ?? null;
  let maxLon = node.bounds?.maxLon ?? node.bounds?.centreLon ?? null;

  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (child.bounds?.minLat != null) minLat = Math.min(minLat ?? 90, child.bounds.minLat);
    if (child.bounds?.maxLat != null) maxLat = Math.max(maxLat ?? -90, child.bounds.maxLat);
    if (child.bounds?.minLon != null) minLon = Math.min(minLon ?? 180, child.bounds.minLon);
    if (child.bounds?.maxLon != null) maxLon = Math.max(maxLon ?? -180, child.bounds.maxLon);
    if (child.centreLat != null) {
      minLat = Math.min(minLat ?? 90, child.centreLat);
      maxLat = Math.max(maxLat ?? -90, child.centreLat);
    }
    if (child.centreLon != null) {
      minLon = Math.min(minLon ?? 180, child.centreLon);
      maxLon = Math.max(maxLon ?? -180, child.centreLon);
    }
  }

  if (minLat == null || maxLat == null || minLon == null || maxLon == null) return null;
  return { minLat, maxLat, minLon, maxLon };
}

export function isSelectedNodeOutOfView(
  node: NavigationNodeResponse | null | undefined,
  mapBbox: [number, number, number, number] | null,
): boolean {
  if (!mapBbox || !node) return false;

  const extent = getHierarchyExtent(node);
  if (!extent) return false;

  const [south, west, north, east] = mapBbox;

  // Panel-aware visible map rectangle
  const latMargin = (north - south) * 0.1;
  const lonMarginRight = (east - west) * 0.25;
  const lonMarginLeft = (east - west) * 0.1;

  const usableSouth = south + latMargin;
  const usableNorth = north - latMargin;
  const usableWest = west + lonMarginLeft;
  const usableEast = east - lonMarginRight;

  const extentFitsLat = extent.minLat >= usableSouth && extent.maxLat <= usableNorth;
  const extentFitsLon = extent.minLon >= usableWest && extent.maxLon <= usableEast;

  return !extentFitsLat || !extentFitsLon;
}

export function getCameraIntentForRecenter(node: NavigationNodeResponse | null | undefined): {
  cameraBounds: CameraIntent['bounds'];
  centre: [number, number];
  kind: 'leaf' | 'overview';
} | null {
  const extent = getHierarchyExtent(node);
  if (!node || !extent) return null;

  const centreLat = (extent.minLat + extent.maxLat) / 2;
  const centreLon = (extent.minLon + extent.maxLon) / 2;
  const cameraBounds: CameraIntent['bounds'] = [[extent.minLat, extent.minLon], [extent.maxLat, extent.maxLon]];

  return {
    cameraBounds,
    centre: [centreLat, centreLon],
    kind: node.nodeType === 'AREA' ? 'leaf' : 'overview',
  };
}
