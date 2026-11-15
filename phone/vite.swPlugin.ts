import type { Plugin } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Emits /sw.js for the phone PWA from phone/sw-template.js, filling in the list of
 *  every built file (bundle output + public/) and a content hash as the cache
 *  version. Build-only: the dev server never registers a worker. */
export function phoneServiceWorker(opts: { template: string; publicDir: string }): Plugin {
  return {
    name: "pensieve-phone-sw",
    apply: "build",
    generateBundle(_options, bundle) {
      const hash = createHash("sha256");
      const urls = new Set<string>(["/"]);

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.endsWith(".map")) continue;
        if (fileName === "index.html") continue; // precached as "/" (asset hashes already version it)
        urls.add(`/${fileName}`);
        hash.update(fileName);
        hash.update(chunk.type === "chunk" ? chunk.code : chunk.source);
      }
      for (const file of walk(opts.publicDir)) {
        urls.add(`/${relative(opts.publicDir, file).split("\\").join("/")}`);
        hash.update(readFileSync(file));
      }

      const source = readFileSync(opts.template, "utf8")
        .replace('const VERSION = "__VERSION__";', `const VERSION = "${hash.digest("hex").slice(0, 12)}";`)
        .replace("const PRECACHE = __PRECACHE__;", `const PRECACHE = ${JSON.stringify([...urls].sort(), null, 2)};`);
      if (source.includes("= __")) this.error("sw-template placeholders not filled");
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name.startsWith(".")) continue;
    out = statSync(p).isDirectory() ? out.concat(walk(p)) : out.concat(p);
  }
  return out;
}
