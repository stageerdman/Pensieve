// Phase 5 spike: real `claude -p` fill on the Daily Review with a realistic Czech take.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { DAILY_REVIEW } from "../../../src/lib/forms/dailyReview.fixture";
import { applyAnswers, memoryFromForm, parseForm } from "../../../src/lib/forms";
import { buildFillPrompt, fillFieldsOf, parseFillResponse } from "../../../src/lib/formFill/prompt";

const base = memoryFromForm(DAILY_REVIEW, new Date(2026, 10, 12));
const f0 = parseForm(base).fields;
const md = applyAnswers(base, { [f0[2].id]: { text: "Spíš jo." } });
const fields = parseForm(md).fields;
const transcript = `Tak jo, denní review. Dneska bych to dal asi za čtyři, byl to takový mini high, měl jsem dobrou energii. Hour of Power jsem udělal ráno, conditioning taky, asi čtyřicet minut jsem opakoval ty otázky. Nahrávky jsem nenahrál. Jestli jsem byl král, no na hovoru s Novákem jo, držel jsem rámec, ale u druhého klienta jsem ustoupil v ceně, příště bych si měl víc věřit. Odměnit můžu to, že jsem šel cvičit i když se mi nechtělo. Selhal jsem v tom, že jsem odkládal ten email Petrovi, lekce je udělat to hned ráno. Pohyb jsem měl, byl jsem v posilovně. Celebrating wins ne. A Mr Nice Guy, ownership jsem ukázal, když jsem přiznal chybu týmu, ale asertivní jsem nebyl u té ceny.`;
const prompt = buildFillPrompt("Daily Review", fillFieldsOf(fields, parseForm(DAILY_REVIEW).fields), transcript);
const dir = "/tmp/claude-501/pensieve-ai-spike"; mkdirSync(dir, { recursive: true });
const t = Date.now();
const raw = execFileSync("claude", ["-p"], { input: prompt, cwd: dir, encoding: "utf8", timeout: 300_000 });
console.log("SECONDS", ((Date.now() - t) / 1000).toFixed(1));
console.log("RAW\n", raw);
const answers = parseFillResponse(raw, fields);
console.log("PARSED fields:", Object.keys(answers).length, "of", fields.length);
console.log("RESULT\n", applyAnswers(md, answers));
