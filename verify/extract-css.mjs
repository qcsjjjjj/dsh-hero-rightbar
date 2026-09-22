/**
 * Extract the plugin's stylesheet straight out of the shipped client bundle.
 *
 * The verification must exercise the CSS the browser actually receives, not a
 * hand-copied duplicate, so this reads `client/client.js` and slices the
 * `const CSS = \`…\`` template literal out of it.
 *
 * Usage: node verify/extract-css.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, "..", "client", "client.js");
const text = readFileSync(bundle, "utf8");

const marker = "const CSS = `";
const start = text.indexOf(marker);
if (start < 0) throw new Error(`no CSS template literal in ${bundle}`);
const from = start + marker.length;
const end = text.indexOf("`;", from);
if (end < 0) throw new Error(`unterminated CSS template literal in ${bundle}`);

const css = text.slice(from, end);
if (css.includes("${")) {
	throw new Error(
		"the CSS template literal interpolates; the extracted text would not be the stylesheet the browser receives. " +
		"Spell the selectors out instead."
	);
}
writeFileSync(join(here, "plugin.css"), css, "utf8");
console.log(`extracted ${css.length} bytes of plugin CSS from ${bundle}`);
