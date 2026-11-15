// Spike: the real claude -p driving runPackage on a real phone session (fake transcriber).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { PHONE_SESSION } from "../../../src/lib/forms/phoneSession.fixture";
import { DEFAULT_SPELL, withPatronus } from "../../../src/lib/packages";
import { runPackage } from "../../../src/lib/packages/run";

const instruction = process.argv[2] || DEFAULT_SPELL.form;
const pkg = withPatronus(PHONE_SESSION, { spell: "sync", instruction });
const dir = "/tmp/claude-501/pensieve-ai-spike"; mkdirSync(dir, { recursive: true });
const t0 = Date.now();
runPackage(
  { id: "s1", kind: "form", title: "Daily Review", markdown: pkg, fallbackInstruction: DEFAULT_SPELL.form },
  {
    ask: async (p) => { const r = execFileSync("claude", ["-p"], { input: p, cwd: dir, encoding: "utf8", timeout: 300_000 }); console.log("--- REPLY", ((Date.now() - t0) / 1000).toFixed(1) + "s\n" + r.slice(0, 600)); return r; },
    transcribe: async (ref, lang) => { console.log("--- TRANSCRIBE", ref, lang); return "Okay daily review. I'd give today a four. I did the hour of power and body movement, went to the gym. Was I a king? On the call with Lukas yes, I held the frame. Freeform: good day, did priming. What I failed at: I procrastinated on the email to Peter, lesson is do it first thing. Name of the day: light in the distance."; },
    loadTranscript: async () => null,
    status: (s) => console.log("STATUS", s),
  },
).then((r) => { console.log("--- DONE", r.done); console.log(r.markdown.split("\n").filter((l) => l.replace(/​/g, "").trim()).join("\n")); });
