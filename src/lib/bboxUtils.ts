/**
 * Snap a bounding box to a 0.02° grid (≈2.2 km) to maximise cache hits across
 * adjacent viewports. The box is always expanded outward so that the snapped
 * envelope fully contains the original viewport.
 *
 * Floating-point note: intermediate products like `Math.ceil(v / STEP) * STEP`
 * can carry IEEE-754 residue (e.g. 13.360000000000001). `parseFloat(…toFixed(2))`
 * eliminates the residue and guarantees exactly-2-dp decimal strings in query
 * keys and API params, which is a requirement for BboxParser on the backend.
 */
export function snapBbox(
  bbox: [number, number, number, number],
): [number, number, number, number] {
  const STEP = 0.02;
  const snap = (v: number, fn: (x: number) => number) =>
    parseFloat((fn(v / STEP) * STEP).toFixed(2));
  return [
    snap(bbox[0], Math.floor), // south — expand outward
    snap(bbox[1], Math.floor), // west  — expand outward
    snap(bbox[2], Math.ceil),  // north — expand outward
    snap(bbox[3], Math.ceil),  // east  — expand outward
  ];
}
