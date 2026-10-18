// Records the demo video by driving the real app in headless Chromium, scene by scene, with captions.
// Scenes are recorded separately (pausing between them lets LLM rate limits recover) and stitched with ffmpeg.
//   FFMPEG=/path/to/ffmpeg pnpm exec tsx scripts/record-demo.mts   → docs/demo.mp4 (+ docs/*.png screenshots)
//   URL=https://... pnpm exec tsx scripts/record-demo.mts
import { chromium, type Locator, type Page } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const URL = process.env.URL ?? "http://localhost:3100";
const PAUSE = Number(process.env.PAUSE ?? 35_000);
const ONLY = process.env.ONLY?.split(",").map(Number);
const VIEW = { width: 1600, height: 900 };
const OUT = path.join(process.cwd(), "docs");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gary-demo-"));
const pw = path.join(os.homedir(), ".cache/ms-playwright");
const chrome = path.join(pw, fs.readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().pop()!, "chrome-linux64/chrome");
// a full ffmpeg build is needed to stitch scenes (e.g. from the imageio-ffmpeg wheel); set FFMPEG=/path/to/ffmpeg
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

const OVERLAY = () => {
  const w = window as unknown as Record<string, unknown>;
  w.__cap = (t: string) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div");
      el.id = "__cap";
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "96px", transform: "translateX(-50%)", zIndex: "99999",
        background: "rgba(8,10,16,0.94)", color: "#fff", border: "1px solid rgba(245,185,66,0.65)", borderRadius: "14px",
        padding: "12px 22px", font: "600 20px/1.45 system-ui, sans-serif", maxWidth: "1180px", textAlign: "center",
        boxShadow: "0 12px 40px rgba(0,0,0,0.65)", transition: "opacity .3s", pointerEvents: "none",
      });
      document.body.appendChild(el);
    }
    el.style.opacity = t ? "1" : "0";
    if (t) el.innerHTML = t;
  };
  w.__cursor = (x: number, y: number) => {
    let c = document.getElementById("__cursor");
    if (!c) {
      c = document.createElement("div");
      c.id = "__cursor";
      Object.assign(c.style, {
        position: "fixed", width: "22px", height: "22px", borderRadius: "50%", zIndex: "100000", pointerEvents: "none",
        background: "rgba(245,185,66,0.35)", border: "2px solid #f5b942", transform: "translate(-50%,-50%)",
        transition: "left .55s ease, top .55s ease", left: "800px", top: "450px",
      });
      document.body.appendChild(c);
    }
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
  };
};

const sleep = (p: Page, ms: number) => p.waitForTimeout(ms);
const cap = async (p: Page, html: string, ms = 2800) => {
  await p.evaluate((t) => (window as unknown as { __cap: (t: string) => void }).__cap(t), html);
  if (ms) await sleep(p, ms);
};
async function point(p: Page, l: Locator) {
  await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox();
  if (b) await p.evaluate(([x, y]) => (window as unknown as { __cursor: (x: number, y: number) => void }).__cursor(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
  await sleep(p, 650);
}
async function click(p: Page, l: Locator) {
  await point(p, l);
  await l.click();
  await sleep(p, 300);
}
async function setCompare(p: Page, on: boolean) {
  const box = p.locator("input[type=checkbox]");
  if ((await box.isChecked()) !== on) await box.click();
}
const answers = (p: Page) => p.locator("text=/citations verified|unverified citation/").count();
async function ask(p: Page, q: string, waitCompare = false) {
  const before = await answers(p);
  const input = p.locator("input[placeholder^='Ask anything']");
  await point(p, input);
  await input.click();
  await input.pressSequentially(q, { delay: 32 });
  await sleep(p, 350);
  await p.keyboard.press("Enter");
  await p.waitForFunction((n) => document.body.innerText.match(/citations verified|unverified citation/g)?.length === n + 1, before, { timeout: 90_000 });
  if (waitCompare) await p.waitForFunction(() => !document.body.innerText.includes("retrieving top documents"), null, { timeout: 60_000 });
  await sleep(p, 1200);
}
const scrollTo = async (p: Page, text: string | RegExp) => {
  await p.getByText(text).last().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await sleep(p, 900);
};

type Scene = (p: Page) => Promise<void>;
const scenes: Scene[] = [
  // 0 · intro
  async (p) => {
    await sleep(p, 1500);
    await cap(p, "Every company has a <b style='color:#f5b942'>Gary</b>: the one person who knows <i>why</i> everything is the way it is.", 3800);
    await cap(p, "When Gary leaves, the company forgets. So we built a Gary that never leaves, on <b style='color:#f5b942'>FalkorDB</b>.", 3800);
    await cap(p, "Kitestring (synthetic startup): 65 records from Slack, Jira, Notion, meetings and GitHub → one graph of people, systems and <b>decisions</b>.", 4500);
    await point(p, p.locator("canvas").first());
    await cap(p, "", 400);
  },
  // 1 · stale knowledge vs decision lineage
  async (p) => {
    await setCompare(p, true);
    await cap(p, "A support rep asks a simple question…", 1800);
    await cap(p, "", 0);
    await ask(p, "Can a customer get a full refund after 20 days?", true);
    await scrollTo(p, "Same question, plain chunk-retrieval RAG");
    await cap(p, "Plain RAG over the same records says <b style='color:#ff6b6b'>yes, 30 days</b>. It retrieved a policy that was superseded in August.", 4500);
    await scrollTo(p, /Decision lineage ·/);
    await cap(p, "Gary walks <code>SUPERSEDES*</code> edges: <b style='color:#3ddc97'>14 days</b>, decided by Maya on Aug 12 because of BILL-212, replacing two older decisions.", 5200);
    await scrollTo(p, /still state an old decision/);
    await cap(p, "And it finds the docs that are now <b style='color:#ff6b6b'>lying</b>: 3 living docs still say 30 days, with their authors, plus the confused #support thread.", 5000);
    await p.screenshot({ path: path.join(OUT, "refund.png") });
    const trail = p.locator("button:has-text('decision_lineage')").first();
    await trail.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    await sleep(p, 700);
    await click(p, trail);
    await cap(p, "Every answer shows the exact parameterised Cypher FalkorDB ran, with rows and milliseconds. The model never writes Cypher.", 5000);
    const chip = p.locator(".md .chip").first();
    await chip.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await click(p, chip);
    await cap(p, "Every citation is verified against the keys the graph returned. Click and you see the source.", 3800);
    await p.keyboard.press("Escape");
    await click(p, p.locator("div.fixed.inset-0").first());
    const fix = p.locator("button:has-text('Fix it')").first();
    await fix.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await cap(p, "Gary doesn't stop at finding. Let's fix it.", 1500);
    const before = await answers(p);
    await click(p, fix);
    await p.waitForFunction((n) => document.body.innerText.match(/citations verified|unverified citation/g)?.length === n + 1, before, { timeout: 90_000 });
    await sleep(p, 1500);
    await scrollTo(p, /Action taken/);
    await cap(p, "Tickets are written back into the graph and assigned to each doc's owner (red nodes).", 4200);
  },
  // 2 · expertise + bus factor
  async (p) => {
    await setCompare(p, false);
    await ask(p, "Who should I talk to about ledger-db?");
    await scrollTo(p, /Who knows ledger-db/);
    await cap(p, "Expertise is a role-weighted, recency-decayed traversal: authored &gt; assigned &gt; reviewed; asking a question counts less than answering.", 4600);
    await cap(p, "Tomasz holds most of the ledger-db knowledge… and he's <b style='color:#ff6b6b'>on parental leave from Nov 2</b>, inside the Atlas rollback window.", 4800);
    await p.screenshot({ path: path.join(OUT, "experts.png") });
  },
  // 3 · risk radar
  async (p) => {
    await setCompare(p, false);
    await ask(p, "What are our biggest knowledge risks right now?");
    await scrollTo(p, /Risk radar/);
    await cap(p, "Graph algorithms as agent tools: knowledge concentration, <code>algo.betweenness</code> for knowledge brokers, upcoming absences and stale docs.", 5200);
  },
  // 4 · multi-hop why
  async (p) => {
    await setCompare(p, false);
    await ask(p, "Why is usage-based pricing launching Dec 1?");
    await scrollTo(p, /Decision lineage ·/);
    await cap(p, "Multi-hop <i>why</i>: Dec 1 replaced Nov 15 ← because the Atlas ledger cutover is Oct 28 ← which moved there because of the SOC2 audit freeze.", 5800);
  },
  // 5 · live feed + memory goes stale
  async (p) => {
    await setCompare(p, false);
    await click(p, p.locator("button:has-text('Live feed')"));
    await cap(p, "The company keeps talking. The CEO posts a new refund policy in #billing…", 2600);
    await click(p, p.locator("button:has-text('CEO changes the refund policy again')"));
    await sleep(p, 800);
    await click(p, p.locator("button:has-text('Post to Slack')"));
    await p.waitForSelector("text=/Superseded:|No new decision|Failed/", { timeout: 90_000 });
    await sleep(p, 800);
    await cap(p, "Gary links it, extracts the decision <i>against what the graph already knows</i>, and automatically <b>supersedes</b> the 14-day rule.", 5200);
    await click(p, p.locator("button:has-text('Company graph')"));
    await ask(p, "Can a customer get a full refund after 20 days?");
    await p.locator("text=Remembered from earlier").first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    await sleep(p, 900);
    await cap(p, "Memory lives in the graph too: the earlier answer is flagged <b style='color:#ff6b6b'>OUTDATED</b> because the decision it cited was just superseded.", 5600);
    await p.screenshot({ path: path.join(OUT, "memory.png") });
  },
  // 5b · catch up
  async (p) => {
    await setCompare(p, false);
    await ask(p, "I'm Priya, back from 3 weeks off. What did I miss?");
    await scrollTo(p, /What changed since/);
    await cap(p, "\"What did I miss?\" is scoped to Priya's world in the graph (systems her team owns, projects she touched), including the refund change posted a minute ago.", 5600);
  },
  // 6 · honesty
  async (p) => {
    await setCompare(p, false);
    await ask(p, "Who owns the mobile app?");
    await cap(p, "Names are resolved against the graph before any reasoning. Not in the graph means Gary <b>says so</b>; it never guesses \"web-app\".", 4800);
  },
  // 7 · outro
  async (p) => {
    await click(p, p.locator("button:has-text('How it works')"));
    await sleep(p, 600);
    await cap(p, "FalkorDB does the thinking: <code>SUPERSEDES*</code> lineage · stale-doc detection · <code>algo.SPpaths</code> · betweenness · label propagation · memory that knows when it's stale · MCP server", 6000);
    await cap(p, "<span style='font-size:30px;font-weight:900'>gary<span style='color:#f5b942'>.</span></span><br/>Every company has a Gary. This one never leaves.<br/><span style='color:#8691a8;font-size:16px'>github.com/hassaansaleem28/gary</span>", 5000);
  },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!ONLY || ONLY.includes(0)) {
    const r = await fetch(`${URL}/api/reset`, { method: "POST" });
    console.log("reset", r.status);
  }
  const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined, args: ["--no-sandbox"] });
  const files: string[] = [];
  for (const [i, scene] of scenes.entries()) {
    if (ONLY && !ONLY.includes(i)) continue;
    const ctx = await browser.newContext({ viewport: VIEW, recordVideo: { dir: path.join(TMP, `s${i}`), size: VIEW } });
    await ctx.addInitScript(OVERLAY);
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    try {
      await scene(page);
    } catch (e) {
      console.error(`scene ${i} failed:`, (e as Error).message);
      await page.screenshot({ path: path.join(OUT, `failed-scene-${i}.png`) });
    }
    await page.waitForTimeout(600);
    const video = page.video()!;
    await ctx.close();
    const f = path.join(OUT, `scene-${i}.webm`);
    await video.saveAs(f);
    files.push(f);
    console.log(`scene ${i} recorded`);
    if (i < scenes.length - 1) await new Promise((r) => setTimeout(r, PAUSE));
  }
  await browser.close();
  if (files.length > 1) {
    const list = path.join(TMP, "list.txt");
    fs.writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
    const out = path.join(OUT, "demo.mp4");
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "fast", "-movflags", "+faststart", out], { stdio: "inherit" });
    console.log("→", out);
  }
}

main();
