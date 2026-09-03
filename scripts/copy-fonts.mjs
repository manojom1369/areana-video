#!/usr/bin/env node
/**
 * Copies the Montserrat latin woff2 files shipped by @fontsource/montserrat
 * (devDependency) into public/fonts/ so the Remotion compositions can load
 * them locally via staticFile() — no Google Fonts CDN needed at render time.
 *
 * Usage: npm run fonts
 */
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(here, "../node_modules/@fontsource/montserrat/files");
const targetDir = resolve(here, "../public/fonts");

const weights = ["400", "500", "600", "700", "800", "900"];

mkdirSync(targetDir, { recursive: true });

let copied = 0;
for (const weight of weights) {
  const src = resolve(sourceDir, `montserrat-latin-${weight}-normal.woff2`);
  const dst = resolve(targetDir, `Montserrat-${weight}.woff2`);
  if (!existsSync(src)) {
    console.error(`Missing ${src} — run "npm install" first.`);
    process.exit(1);
  }
  copyFileSync(src, dst);
  copied++;
}

console.log(`Copied ${copied} Montserrat weights to public/fonts/`);
