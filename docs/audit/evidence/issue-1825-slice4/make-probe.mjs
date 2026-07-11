import fs from "node:fs";
const src = "src/lib/map/areaMarkerBucketing.test.ts";
const dst = "src/lib/map/areaMarkerBucketing.probe.test.ts";
const lines = fs.readFileSync(src, "utf8").split("\n");
// Lines are 1-indexed in the editor; array is 0-indexed.
// Disable the two count asserts in the 30-tight-core test (editor lines 207, 208).
for (const ln of [207, 208]) {
  const i = ln - 1;
  if (/representatives\.length/.test(lines[i])) {
    lines[i] = "    // PROBE-DISABLED " + lines[i].trim();
  } else {
    throw new Error("unexpected content at line " + ln + ": " + lines[i]);
  }
}
// Insert a probe log after the clusters assert (editor line 209).
const insertAfter = 209 - 1;
lines.splice(insertAfter + 1, 0,
  "    const _probeReps = result.representatives.map((a) => a.id);",
  "    const _probeEdges = ['edge-ne','edge-nw','edge-se','edge-sw'].filter((id) => new Set(_probeReps).has(id));",
  "    console.log('PROBE_30_TIGHT_CORE reps=' + result.representatives.length + ' clusters=' + result.clusters.length + ' edgesPresent=' + JSON.stringify(_probeEdges));");
fs.writeFileSync(dst, lines.join("\n"));
console.log("probe written to " + dst);
