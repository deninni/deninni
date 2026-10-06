// Baut die Browser-Demo als eine einzige HTML-Datei (für claude.ai-Artifact oder lokales Öffnen).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = await build({ entryPoints: [path.join(here, "app.ts")], bundle: true, minify: true, format: "iife", platform: "browser", target: "es2020", write: false, legalComments: "none" });
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync(path.join(here, "shell.html"), "utf8").replace("/*APP*/", () => js);
const dist = process.argv[2] ?? path.join(here, "../../dist");
mkdirSync(dist, { recursive: true });
writeFileSync(path.join(dist, "plantos-demo.html"), html);
console.log(`plantos-demo.html geschrieben (${(html.length / 1024).toFixed(0)} KB) → ${dist}`);
