#!/usr/bin/env node
/**
 * Bundles the editor web app (editor/) into server/public/editor.bundle.js
 * (+ editor.css) with esbuild. The Express server statically serves
 * server/public/, so the editor is available at
 * http://localhost:3000/editor.html — no dev-server needed.
 *
 * Usage: node scripts/build-editor.mjs [--watch]
 */
import { build, context } from "esbuild";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outdir = path.resolve(root, "server/public");
mkdirSync(outdir, { recursive: true });

const watch = process.argv.includes("--watch");

const common = {
  entryPoints: [path.resolve(root, "editor/main.tsx")],
  bundle: true,
  outdir,
  format: "iife",
  globalName: "AreanaEditor",
  sourcemap: "linked",
  target: ["es2020"],
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
};

if (watch) {
  const ctx = await context(common);
  await ctx.watch();
  console.log("watching editor… (Ctrl+C to stop)");
} else {
  await build(common);
  console.log("editor bundle written to", outdir);
}
