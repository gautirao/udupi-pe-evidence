import fs from "node:fs";
import path from "node:path";
const runDir = process.argv[2];
const filter = process.argv[3] || "";
const cwd = process.cwd();
const jsons = fs.readdirSync(runDir).filter(f => /^batch-.*\.json$/.test(f));
for (const jf of jsons) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(runDir, jf), "utf8")); } catch { continue; }
  for (const f of (j.testResults || [])) {
    const key = f.name.replace(cwd + "/", "");
    if (filter && !key.includes(filter)) continue;
    const fails = (f.assertionResults || []).filter(a => a.status === "failed");
    if (!fails.length) continue;
    console.log("\n########", key, "(" + fails.length + " failing)");
    // print first 2 failing tests' first ~6 message lines
    fails.slice(0, 2).forEach(a => {
      console.log("  >>", a.title);
      const msg = (a.failureMessages || []).join("\n").split("\n").slice(0, 8).join("\n   ");
      console.log("   ", msg);
    });
  }
}
