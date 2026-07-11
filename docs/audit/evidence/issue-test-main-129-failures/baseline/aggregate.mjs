import fs from "node:fs";
import path from "node:path";

const runDir = process.argv[2] || "docs/audit/evidence/issue-test-main-129-failures/baseline/run-1";
const cwd = process.cwd();
const jsons = fs.readdirSync(runDir).filter(f => /^batch-.*\.json$/.test(f));
let tot = 0, pass = 0, fail = 0, skip = 0;
const failByFile = {};
const sigByFile = {};
const failTitles = {};

function classify(msgs) {
  if (/Unable to find|TestingLibraryElementError|getByText|getByRole|getByTestId|getByLabelText/.test(msgs)) return "query-not-found";
  if (/is not a function|Cannot read propert|Cannot destructure|undefined is not|is not defined|ReferenceError|TypeError/.test(msgs)) return "TypeError/undefined";
  if (/toHaveBeenCalled|number of calls|spy|mock/.test(msgs)) return "mock-call-mismatch";
  if (/[Ss]napshot/.test(msgs)) return "snapshot";
  if (/timeout|timed out/i.test(msgs)) return "timeout";
  if (/expected .* (to be|to equal|to deeply equal|to match)/i.test(msgs)) return "assertion-value-mismatch";
  if (/Failed to resolve import|Cannot find module|Missing ".*" export/.test(msgs)) return "module-resolution";
  return "other";
}

for (const jf of jsons) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(runDir, jf), "utf8")); }
  catch (e) { console.log("PARSE-FAIL", jf, e.message); continue; }
  tot += j.numTotalTests || 0; pass += j.numPassedTests || 0; fail += j.numFailedTests || 0; skip += j.numPendingTests || 0;
  for (const f of (j.testResults || [])) {
    const fails = (f.assertionResults || []).filter(a => a.status === "failed");
    if (!fails.length) continue;
    const key = f.name.replace(cwd + "/", "");
    failByFile[key] = fails.length;
    failTitles[key] = fails.map(a => a.title);
    const msgs = fails.map(a => (a.failureMessages || []).join(" ")).join(" ");
    sigByFile[key] = classify(msgs);
  }
}

console.log("JSON batches parsed:", jsons.length);
console.log("TOTALS total:", tot, "passed:", pass, "failed:", fail, "skipped:", skip);
console.log("FAILING FILES:", Object.keys(failByFile).length);
console.log("--- per file: count [signature] path ---");
for (const [f, c] of Object.entries(failByFile).sort((a, b) => b[1] - a[1])) {
  console.log(String(c).padStart(3), "[" + sigByFile[f] + "]", f);
}
if (process.argv[3] === "--titles") {
  console.log("--- failing test titles (first 3 per file) ---");
  for (const [f, titles] of Object.entries(failTitles)) {
    console.log("#", f);
    titles.slice(0, 3).forEach(t => console.log("   -", t));
  }
}
