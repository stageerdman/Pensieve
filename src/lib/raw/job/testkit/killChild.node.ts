// Test-only: the child process the SIGKILL test starts — one "app start" on a real folder.
// After every write it prints `@@W <n>` and pauses briefly, so the parent's SIGKILL lands
// right after that write. Usage: node killChild.mjs <vaultDir>
import { appStart } from "./scenario";
import { nodeFiles } from "./nodeFiles.node";
import { writeSync } from "node:fs";

const PAUSE_MS = 5;
const pause = new Int32Array(new SharedArrayBuffer(4));
let writes = 0;

const files = nodeFiles(process.argv[2], () => {
  writes += 1;
  writeSync(1, `@@W ${writes}\n`);
  Atomics.wait(pause, 0, 0, PAUSE_MS);
});

appStart(files).then(
  () => writeSync(1, "@@DONE\n"),
  (e: unknown) => {
    writeSync(2, `@@FAIL ${String(e)}\n`);
    process.exit(1);
  },
);
