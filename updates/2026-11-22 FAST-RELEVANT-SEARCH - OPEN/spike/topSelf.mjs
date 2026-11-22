// Summarise a .cpuprofile: top functions by self time. Run: node topSelf.mjs <dir-with-cpuprofile>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const file = readdirSync(dir).filter((f) => f.endsWith(".cpuprofile")).sort().pop();
const prof = JSON.parse(readFileSync(join(dir, file), "utf8"));
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = prof.timeDeltas;
prof.samples.forEach((id, i) => {
  const n = byId.get(id);
  const f = n.callFrame;
  const key = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
});
const rows = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25);
for (const [k, us] of rows) console.log(`${(us / 1000).toFixed(0).padStart(7)}ms  ${k}`);
