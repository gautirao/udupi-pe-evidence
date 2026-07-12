// Sample RSS of the live vitest worker(s) every 2s for ~40s to capture the
// BEFORE (unstable-mock) unbounded heap growth curve. Read-only measurement.
import { execSync } from "node:child_process";
const out = [];
const t0 = Date.now();
for (let i = 0; i < 20; i++) {
  let line = "";
  try {
    // Sum RSS (KB) of all node processes whose args mention vitest.
    const ps = execSync("ps -Ao rss=,pid=,args= | grep -i vitest | grep -v grep", { encoding: "utf8" });
    let totalKb = 0;
    const pids = [];
    for (const l of ps.trim().split("\n")) {
      const m = l.trim().match(/^(\d+)\s+(\d+)/);
      if (m) { totalKb += parseInt(m[1], 10); pids.push(m[2]); }
    }
    const sec = ((Date.now() - t0) / 1000).toFixed(0);
    line = `t+${sec}s  totalRSS=${(totalKb / 1024).toFixed(0)}MB  pids=[${pids.join(",")}]`;
  } catch (e) {
    line = `t+${((Date.now() - t0) / 1000).toFixed(0)}s  (no vitest process — likely OOM-exited)`;
  }
  console.log(line);
  out.push(line);
  // busy-wait ~2s without foreground sleep
  const until = Date.now() + 2000;
  while (Date.now() < until) { /* spin */ }
}
console.log("--- sampling done ---");
