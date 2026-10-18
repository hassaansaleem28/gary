// pnpm exec tsx scripts/shots.mts <path> <theme> <width> <height> <outPrefix> [scrollY,...]
import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [p = "/", theme = "dark", w = "1440", h = "900", out = "shot", ys = "0"] = process.argv.slice(2);
const pw = path.join(os.homedir(), ".cache/ms-playwright");
const exe = path.join(pw, fs.readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().pop()!, "chrome-linux64/chrome");
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, colorScheme: theme as "dark" | "light" });
await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text().slice(0, 200)));
await page.goto((process.env.URL ?? "http://localhost:3100") + p, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(process.env.WAIT ?? 4500));
for (const y of ys.split(",").map(Number)) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}-${y}.png` });
}
await browser.close();
