/**
 * dsh-hero-rightbar — install reconciliation.
 *
 * One command that answers "is the fix actually the thing the running server
 * serves?". It compares four views of the same artifact and the two install
 * records that could silently revert it:
 *
 *   source          the repository copy in this plugin directory
 *   installed       <profile>/node_modules/dsh-hero-rightbar (what the loader reads)
 *   tarball         the plugin-kit tarball a future `pnpm install` re-links from
 *   lockfile        the integrity pnpm records for that tarball
 *   served          the artifact the live `dsh web` publishes for the plugin
 *
 * Usage: node verify/check-install.mjs [http://127.0.0.1:3080]
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const base = process.argv[2] ?? "http://127.0.0.1:3080";
const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "client", "client.js");
const profile = join(homedir(), ".dsh", "profiles", "web");
const installed = join(profile, "node_modules", "dsh-hero-rightbar", "client", "client.js");
const tarball = join(homedir(), ".dsh", "plugin-kit", "dsh-hero-rightbar", "dsh-hero-rightbar-0.1.0.tgz");
const lockfile = join(profile, "pnpm-lock.yaml");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha512integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

let failures = 0;
const check = (name, ok, detail = "") => {
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `\n        ${detail}`}`);
	if (!ok) failures += 1;
};

// ── 1. the bundle bytes ───────────────────────────────────────────────────────
const sourceBytes = readFileSync(source);
const installedBytes = readFileSync(installed);
check("installed bundle is byte-identical to the source", sha256(installedBytes) === sha256(sourceBytes),
	`sha256 ${sha256(sourceBytes)} (${sourceBytes.byteLength} bytes)`);
check("installed bundle carries the CSS arbitration", installedBytes.includes(Buffer.from("body:has([data-sidebar-right-expand])")));
check("installed bundle has no render-time DOM probe", !installedBytes.includes(Buffer.from("document.querySelector(BUILTIN_SELECTOR)")));
check("installed bundle has no un-evaluated CSS interpolation", !installedBytes.includes(Buffer.from("${BUILTIN_SELECTOR}")));

// ── 2. the tarball a reinstall would use ─────────────────────────────────────
const tarballBytes = readFileSync(tarball);
const stage = mkdtempSync(join(tmpdir(), "dsh-hero-rightbar-check-"));
try {
	execFileSync("tar", ["-xzf", tarball, "-C", stage], { stdio: "inherit" });
	const packed = readFileSync(join(stage, "package", "client", "client.js"));
	check("tarball carries the same bundle", sha256(packed) === sha256(sourceBytes),
		`tarball sha256 ${sha256(packed)}`);
} finally {
	rmSync(stage, { recursive: true, force: true });
}

// ── 3. the install record that could revert it ───────────────────────────────
const lock = readFileSync(lockfile, "utf8");
const entry = /dsh-hero-rightbar@file:[\s\S]{0,400}?integrity: (sha512-[^,}]+)/.exec(lock);
const want = sha512integrity(tarballBytes);
check("lockfile integrity matches the tarball it points at", entry?.[1] === want,
	entry === null ? "no integrity recorded for the file: dependency" : `lock ${entry[1]}`);

// ── 4. what the running server actually publishes ────────────────────────────
let served = "";
let servedRev = "";
try {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 8000);
	const events = await fetch(`${base}/plugins/events`, { signal: controller.signal, headers: { accept: "text/event-stream" } });
	const reader = events.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (servedRev === "") {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		/* The stream opens with a blank frame, so several frames can already be
		   sitting in the buffer; drain every complete one before reading again. */
		let split;
		while (servedRev === "" && (split = buffer.indexOf("\n\n")) >= 0) {
			const raw = buffer.slice(0, split);
			buffer = buffer.slice(split + 2);
			const data = raw.split(/\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
			if (data === "") continue;
			try {
				const payload = JSON.parse(data);
				const entries = payload.type === "graph" ? payload.graph?.entries ?? [] : payload.entries ?? [];
				servedRev = entries.find((candidate) => candidate.id === "dsh-hero-rightbar")?.rev ?? "";
			} catch {
				/* not a frame this check models */
			}
		}
	}
	clearTimeout(timer);
	controller.abort();
} catch (error) {
	check("live server graph reachable", false, String(error?.message ?? error));
}

if (servedRev !== "") {
	const url = `${base}/plugins/??dsh-hero-rightbar/client.js&rev=${servedRev}`;
	const response = await fetch(url);
	served = await response.text();
	check(`served artifact (rev ${servedRev}) carries the CSS arbitration`, served.includes("body:has([data-sidebar-right-expand])"));
	check("served artifact has no render-time DOM probe", !served.includes("document.querySelector(BUILTIN_SELECTOR)"));
}

console.log(`\n${failures === 0 ? "OK - source, install, tarball, lockfile and the live server all agree on the fixed bundle" : `${failures} failure(s)`}`);
process.exitCode = failures === 0 ? 0 : 1;
