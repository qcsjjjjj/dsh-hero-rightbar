/**
 * Prove that the running `dsh web` picks a rewritten plugin bundle up WITHOUT a
 * restart.
 *
 * The chain under test (all of it live in this process):
 *
 *   1. @deepseek-ai/dsh-client-hmr stats every composed client bundle and
 *      reports a real revision change on /plugins/events;
 *   2. the modules node half re-publishes the artifact under a new revision;
 *   3. the browser half swaps the plugin in place.
 *
 * This script can witness (1) and (2) from outside the browser: it appends a
 * marker comment to the installed bundle, waits for the `rebuilt` frame naming
 * dsh-hero-rightbar, restores the exact bytes, waits for the frame that follows,
 * and then fetches the newly announced artifact and checks what the server
 * actually serves.
 *
 * Usage: node verify/prove-live-reload.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const bundlePath = join(homedir(), ".dsh", "profiles", "web", "node_modules", "dsh-hero-rightbar", "client", "client.js");
const eventsUrl = "http://127.0.0.1:3080/plugins/events";
const baseUrl = "http://127.0.0.1:3080";

const baseline = readFileSync(bundlePath);
const baselineHash = createHash("sha256").update(baseline).digest("hex");
console.log(`installed bundle: ${bundlePath}`);
console.log(`baseline sha256 : ${baselineHash} (${baseline.byteLength} bytes)`);

/** SSE reader with a queue, so a frame that arrives before we ask is not lost. */
function openEvents(signal) {
	const frames = [];
	const waiters = [];
	const push = (frame) => {
		const waiter = waiters.shift();
		if (waiter === undefined) frames.push(frame);
		else waiter(frame);
	};
	(async () => {
		const response = await fetch(eventsUrl, { signal, headers: { accept: "text/event-stream" } });
		console.log(`/plugins/events -> HTTP ${response.status}`);
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let split;
			while ((split = buffer.indexOf("\n\n")) >= 0) {
				const raw = buffer.slice(0, split);
				buffer = buffer.slice(split + 2);
				const data = raw.split(/\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
				if (data === "") continue;
				try {
					push(JSON.parse(data));
				} catch {
					/* a frame type this script does not model */
				}
			}
		}
	})().catch((error) => {
		if (error?.name !== "AbortError") console.error(`events stream ended: ${error.message}`);
	});
	return (timeoutMs) => {
		if (frames.length > 0) return Promise.resolve(frames.shift());
		return new Promise((resolve) => {
			const timer = setTimeout(() => resolve(undefined), timeoutMs);
			waiters.push((frame) => {
				clearTimeout(timer);
				resolve(frame);
			});
		});
	};
}

/** Wait for a rebuilt frame that names the plugin. */
async function awaitRebuilt(next, label) {
	for (;;) {
		const frame = await next(20000);
		if (frame === undefined) throw new Error(`${label}: no rebuilt frame within 20s`);
		if (frame.type !== "rebuilt") continue;
		/* The frame names one artifact ({id, rev}); tolerate a batched shape too. */
		const named = frame.id === "dsh-hero-rightbar"
			? frame
			: (frame.entries ?? []).find((entry) => entry.id === "dsh-hero-rightbar");
		if (named === undefined) continue;
		console.log(`${label}: rebuilt frame -> dsh-hero-rightbar rev=${named.rev}`);
		return named.rev;
	}
}

/** Fetch one artifact through the combo route the browser uses and report its content. */
async function fetchArtifact(rev) {
	const url = `${baseUrl}/plugins/??dsh-hero-rightbar/client.js&rev=${rev}`;
	const response = await fetch(url);
	const text = await response.text();
	console.log(`  GET ${url}\n  -> HTTP ${response.status}, ${text.length} chars`);
	return text;
}

const controller = new AbortController();
const next = openEvents(controller.signal);
await new Promise((resolve) => setTimeout(resolve, 1200)); // let the graph frame land

const marker = "\n/* dsh-hero-rightbar: live-reload probe (removed immediately) */\n";
let failures = 0;
const check = (name, ok) => {
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
	if (!ok) failures += 1;
};

try {
	writeFileSync(bundlePath, Buffer.concat([baseline, Buffer.from(marker, "utf8")]));
	console.log("\nappended a marker comment to the installed bundle…");
	const touchedRev = await awaitRebuilt(next, "change");
	const touchedText = await fetchArtifact(touchedRev);
	check("rebuilt artifact carries the marker (server re-published the change)", touchedText.includes("live-reload probe"));

	writeFileSync(bundlePath, baseline);
	console.log("\nrestored the exact fixed bundle…");
	const restoredRev = await awaitRebuilt(next, "restore");
	const restoredText = await fetchArtifact(restoredRev);
	check("restored artifact is the fix", restoredText.includes("body:has([data-sidebar-right-expand])"));
	check("restored artifact has no render-time probe", !restoredText.includes("document.querySelector(BUILTIN_SELECTOR)"));
	check("restored artifact carries no probe marker", !restoredText.includes("live-reload probe"));
} finally {
	controller.abort();
	writeFileSync(bundlePath, baseline);
}

const finalHash = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
check(`installed bundle is byte-identical to the baseline (${finalHash})`, finalHash === baselineHash);

console.log(`\n${failures === 0 ? "OK" : `${failures} failure(s)`} — the running server re-published the plugin bundle with no restart`);
process.exitCode = failures === 0 ? 0 : 1;
