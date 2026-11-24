// Times the first-time visitor's path through the showcase: how long each scene plays
// at real speed, and how long the Mac takes from "Open your Mac" to a ready chat.
// Chrome gets killed on long runs on this machine, so each part gets its own browser.
// Run: node showcase/walkthrough.mjs [filter]
import { chromium } from "playwright-core";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const html = pathToFileURL(resolve(here, "pensieve-showcase.html")).href;
const only = process.argv[2];

async function timed(label, script) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on("pageerror", (e) => console.error(`[${label}] page error:`, e.message));
      await page.goto(html);
      await page.waitForTimeout(300);
      const ms = await page.evaluate(script);
      return ms;
    } catch (e) {
      if (attempt === 3) { console.error(`[${label}] failed:`, e.message.split("\n")[0]); return NaN; }
    } finally { await browser.close().catch(() => {}); }
  }
}

const SC = "window.__showcase";
let total = 0;
const ids = ["wand", "write", "record", "film", "snap", "journal", "ipad", "form", "patronus", "accio"];
for (const id of ids) {
  if (only && !id.includes(only)) continue;
  const ms = await timed(id, `(async()=>{const t=performance.now(); await ${SC}.playMode('${id}'); return performance.now()-t;})()`);
  total += ms; console.log(`${id.padEnd(9)} ${(ms / 1000).toFixed(1)}s`);
}
if (!only || "mac".includes(only)) {
  // everything caught first (instantly), then the Mac at real speed until the chat is ready
  const ms = await timed("mac", `(async()=>{const s=${SC};
    for (const m of ['write','record','film','snap','journal','ipad','form','patronus']) { const p=s.playMode(m); await new Promise(r=>setTimeout(r,20)); s.skip(); await p; }
    const t=performance.now(); s.openMac();
    await new Promise(r=>{const iv=setInterval(()=>{ if(document.querySelector('#chat').classList.contains('on')){clearInterval(iv);r();} },50);});
    return performance.now()-t;})()`);
  total += ms; console.log(`mac→chat  ${(ms / 1000).toFixed(1)}s`);
  const ans = await timed("answer", `(async()=>{const s=${SC}; const t=performance.now(); s.openMac(); await new Promise(r=>{const iv=setInterval(()=>{ if(document.querySelector('#chat').classList.contains('on')){clearInterval(iv);r();} },50);}); const t2=performance.now(); await s.ask(s.DATA.chat.qs[2].q); return performance.now()-t2;})()`);
  console.log(`answer    ${(ans / 1000).toFixed(1)}s (closing answer)`);
}
if (!only || "auto".includes(only)) {
  // Begin is the only click: the story moves on to Write by itself; a click elsewhere keeps it on the scene
  const moved = await timed("auto", `(async()=>{ document.querySelector('#gp').click(); const s=__showcase.S;
    await new Promise(r=>{const iv=setInterval(()=>{ if(!s.busy && s.done.has('wand')){clearInterval(iv);r();} },50);});
    await new Promise(r=>setTimeout(r,3600)); return s.scene; })()`);
  const stayed = await timed("stay", `(async()=>{ document.querySelector('#gp').click(); const s=__showcase.S;
    await new Promise(r=>{const iv=setInterval(()=>{ if(!s.busy && s.done.has('wand')){clearInterval(iv);r();} },50);});
    document.querySelector('#stage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    await new Promise(r=>setTimeout(r,3600)); return s.scene; })()`);
  console.log(`auto-advance: after the Wand it ${moved === "write" ? "moved on to Write by itself ✓" : "did NOT move on ✗ (" + moved + ")"}; after a click it ${stayed === "wand" ? "stayed ✓" : "moved anyway ✗ (" + stayed + ")"}`);
}
console.log(`\nwatch time, all scenes + Mac: ${(total / 1000).toFixed(1)}s`);
