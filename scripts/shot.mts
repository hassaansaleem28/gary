// Drives the UI in headless Chromium: pnpm exec tsx scripts/shot.mts "<question>" out.png [--live]
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const base = path.join(os.homedir(), ".cache/ms-playwright");
const dir = fs.readdirSync(base).filter((d) => d.startsWith("chromium-")).sort().pop()!;
const exe = path.join(base, dir, "chrome-linux64/chrome");
const [q, out = "shot.png"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(process.env.URL ?? "http://localhost:3100", { waitUntil: "networkidle" });
if (q) {
  await page.fill("input[placeholder^='Ask anything']", q);
  await page.click("button:has-text('Ask')");
  await page.waitForSelector(".md", { timeout: 60000 });
  await page.waitForTimeout(3500);
}
await page.screenshot({ path: out });
await browser.close();
console.log("saved", out);
