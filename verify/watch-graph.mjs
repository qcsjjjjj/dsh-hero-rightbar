/**
 * Read the running `dsh web` client-module graph over its HMR SSE channel.
 *
 * `/plugins/events` broadcasts a `graph` frame on connect and `rebuilt` frames
 * when a watched client bundle actually changes. Reading it is how this script
 * proves, without restarting anything and without a browser, that the live
 * server has composed dsh-hero-rightbar and is watching its bundle.
 *
 * Usage: node verify/watch-graph.mjs [seconds]
 */
const seconds = Number(process.argv[2] ?? 10);
const url = "http://127.0.0.1:3080/plugins/events";

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), seconds * 1000);

let text = "";
try {
	const response = await fetch(url, { signal: controller.signal, headers: { accept: "text/event-stream" } });
	console.log(`HTTP ${response.status} ${response.headers.get("content-type") ?? ""}`);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		text += decoder.decode(value, { stream: true });
	}
} catch (error) {
	if (error?.name !== "AbortError") throw error;
} finally {
	clearTimeout(timer);
}

const frames = text.split(/\n\n+/).filter((frame) => frame.trim() !== "");
console.log(`captured ${text.length} bytes / ${frames.length} frames in ${seconds}s`);

for (const frame of frames) {
	const data = frame.split(/\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
	if (data === "") continue;
	let payload;
	try {
		payload = JSON.parse(data);
	} catch {
		console.log(`unparsed frame: ${data.slice(0, 120)}`);
		continue;
	}
	if (payload.type === "graph") {
		const entries = payload.graph?.entries ?? [];
		console.log(`graph frame: rev=${payload.graph?.rev ?? "?"} entries=${entries.length}`);
		for (const entry of entries) {
			if (entry.id === "dsh-hero-rightbar") {
				console.log(`  FOUND dsh-hero-rightbar`);
				console.log(`    rev=${entry.rev}`);
				console.log(`    url=${entry.url}`);
			}
		}
	} else if (payload.type === "rebuilt") {
		const ids = payload.entries?.map((entry) => `${entry.id}@${entry.rev}`) ?? [];
		console.log(`rebuilt frame: ${ids.join(", ") || JSON.stringify(payload).slice(0, 200)}`);
	} else {
		console.log(`frame: ${JSON.stringify(payload).slice(0, 200)}`);
	}
}
