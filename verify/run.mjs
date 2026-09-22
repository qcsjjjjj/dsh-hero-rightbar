/**
 * dsh-hero-rightbar — arbitration verification.
 *
 * Loads verify/arbitration.html in a real Chromium (Microsoft Edge, launched
 * through the puppeteer-core that already ships inside the DSH profile) and
 * asserts the contract that replaced the old render-time DOM probe:
 *
 *   1. the trigger is visible while the product draws no expand control;
 *   2. it disappears the moment the shipped button enters the DOM — in the same
 *      task, with no React render involved;
 *   3. it comes back the moment that button leaves the DOM again;
 *   4. the frame's fullscreen signal suppresses it too;
 *   5. the removed implementation stays stale across (2)/(3), which is the bug
 *      this revision fixes.
 *
 * Usage: node verify/run.mjs
 */
import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, "..", "client", "client.js");
const pageUrl = pathToFileURL(join(here, "arbitration.html")).href;

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profileRoot = join(homedir(), ".dsh", "profiles", "web");
const puppeteerEntry = join(profileRoot, "node_modules", "puppeteer-core", "lib", "puppeteer", "puppeteer-core.js");

const results = [];
function check(name, actual, expected) {
	const ok = actual === expected;
	results.push({ ok, name, actual, expected });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (actual ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`);
}

// ── static check: the bundle carries the CSS arbitration and no render-time probe ──
const bundle = readFileSync(bundlePath, "utf8");
check("bundle: CSS arbitration rule present",
	bundle.includes("body:has([data-sidebar-right-expand]) .dsh-hero-rightbar-trigger"), true);
check("bundle: fullscreen suppression present",
	bundle.includes("body:has([data-rightbar-fullscreen]) .dsh-hero-rightbar-trigger"), true);
check("bundle: no script-side probe of the shipped button",
	bundle.includes('querySelector("[data-sidebar-right-expand]")') || bundle.includes("document.querySelector(BUILTIN_SELECTOR)"), false);
check("bundle: the shipped-button marker is never a quoted JS string",
	bundle.includes('"data-sidebar-right-expand"') || bundle.includes("'data-sidebar-right-expand'"), false);

// ── live check in a real browser ──
const puppeteer = (await import(pathToFileURL(puppeteerEntry).href)).default;
const browser = await puppeteer.launch({
	executablePath: EDGE,
	headless: true,
	userDataDir: mkdtempSync(join(tmpdir(), "dsh-hero-rightbar-verify-")),
	args: ["--no-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check"]
});

try {
	const page = await browser.newPage();
	await page.goto(pageUrl, { waitUntil: "load" });
	console.log(`edge ${await browser.version()} · ${pageUrl}`);

	const visible = (selector) => page.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (el === null) return "absent";
		return getComputedStyle(el).display === "none" ? "hidden" : "visible";
	}, selector);

	// 1. no product control on the page: the way in is drawn.
	check("no shipped control -> trigger visible", await visible("#trigger"), "visible");
	check("no shipped control -> hint visible", await visible("#hint"), "visible");

	// 2. the shipped button enters the DOM (a Session switch commits the header).
	//    The old model must be told to re-decide; CSS must not need telling.
	await page.evaluate(() => window.fixture.drawShippedExpandButton());
	check("shipped control present -> trigger hidden (no render)", await visible("#trigger"), "hidden");
	check("shipped control present -> hint hidden", await visible("#hint"), "hidden");
	check("old model: stale decision not yet taken", await page.evaluate(() => window.fixture.oldTrigger.hidden), false);
	await page.evaluate(() => window.fixture.oldRenderDecision());

	// 3. the shipped button leaves the DOM again (header unmounts, blank Session).
	await page.evaluate(() => window.fixture.removeShippedChrome());
	check("shipped control gone -> trigger visible (no render)", await visible("#trigger"), "visible");
	check("old model: stays hidden without another render (the bug)",
		await page.evaluate(() => window.fixture.oldTrigger.hidden), true);

	// 4. the frame goes fullscreen: the product's own panel covers the viewport.
	await page.evaluate(() => window.fixture.frame.setAttribute("data-rightbar-fullscreen", "true"));
	check("fullscreen -> trigger hidden", await visible("#trigger"), "hidden");

	// 5. and back out of it.
	await page.evaluate(() => window.fixture.frame.removeAttribute("data-rightbar-fullscreen"));
	check("left fullscreen -> trigger visible", await visible("#trigger"), "visible");

	// 6. the arbitration never fires on the plugin's own trigger.
	check("plugin trigger carries no shipped-control marker",
		await page.evaluate(() => window.fixture.shippedButton() === null), true);
} finally {
	await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
