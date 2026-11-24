// Screenshots of the showcase at its key moments (1440×900 @2×), for checking the look.
// Run: node showcase/shoot.mjs [filter]   → showcase/screenshots/*.png
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = pathToFileURL(resolve(here, "pensieve-showcase.html")).href;
const out = resolve(here, "screenshots");
mkdirSync(out, { recursive: true });
const only = process.argv[2];

// each shot: what to run in the page, then how long to let it play before the picture
const SHOTS = [
  { file: "01-arrive.png", run: "", settle: 1500 },
  { file: "02-ring.png", run: "__showcase.playMode('wand')", settle: 1900 },
  { file: "02b-countdown.png", run: "__showcase.playMode('wand')", settle: 1200 }, // the Wand has finished; Next is counting down
  { file: "03-write.png", run: "__showcase.playMode('write')", settle: 5200 },
  { file: "04-record.png", run: "__showcase.playMode('record')", settle: 5200 },
  { file: "05-film.png", run: "__showcase.playMode('film')", settle: 4300 },
  { file: "06-journal.png", run: "__showcase.playMode('journal')", settle: 4300 },
  { file: "07-ipad.png", run: "__showcase.playMode('ipad')", settle: 6800 },
  { file: "08-form.png", run: "__showcase.playMode('form')", settle: 4200 },
  { file: "09-patronus.png", run: "__showcase.playMode('patronus')", settle: 6300 },
  { file: "10-accio.png", run: "__showcase.playMode('accio')", settle: 3600 },
  { file: "11-pour.png", run: "(async()=>{for(const m of ['write','record','journal','snap','patronus']){__showcase.playMode(m);await new Promise(r=>setTimeout(r,50));__showcase.skip();await new Promise(r=>setTimeout(r,900));} __showcase.openMac();})()", settle: 9500 },
  { file: "12-transcribe.png", run: "(async()=>{for(const m of ['record','journal']){__showcase.playMode(m);await new Promise(r=>setTimeout(r,50));__showcase.skip();await new Promise(r=>setTimeout(r,900));} __showcase.openMac();})()", settle: 7600 },
  // the full chat takes ~30s to play; this machine kills Chrome around then, so it runs instantly
  { file: "13-chat.png", instant: true, run: "(async()=>{for(const m of ['write','record','film','snap','journal','form','patronus']) await __showcase.playMode(m); await __showcase.openMac(); await __showcase.ask('What keeps stopping me from teaching?'); await __showcase.ask('Give me one step for this weekend.');})()", settle: 1500 },
];

// One picture in its own browser. Chrome is sometimes killed mid-run on this machine,
// so a failed shot is retried a couple of times before giving up.
async function shoot(s) {
  const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    page.on("pageerror", (e) => console.error(`[${s.file}] page error:`, e.message));
    page.on("console", (m) => m.type() === "error" && console.error(`[${s.file}]`, m.text()));
    if (s.instant) await page.addInitScript(() => { window.__instant = true; });
    await page.goto(html);
    await page.waitForTimeout(300);
    if (s.run) await page.evaluate(s.run);
    await page.waitForTimeout(s.settle);
    await page.screenshot({ path: resolve(out, s.file) });
  } finally {
    await browser.close().catch(() => {});
  }
}

let failed = 0;
for (const s of SHOTS) {
  if (only && !s.file.includes(only)) continue;
  for (let attempt = 1; ; attempt++) {
    try { await shoot(s); console.log("saved", s.file); break; }
    catch (e) {
      if (attempt >= 3) { console.error(`[${s.file}] failed:`, e.message.split("\n")[0]); failed++; break; }
    }
  }
}
process.exit(failed ? 1 : 0);
