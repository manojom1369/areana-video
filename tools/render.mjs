// ─── tools/render.mjs — headless server-side video renderer ──────────────────
// Renders the current project (js/demo.js settings + lyrics) with the SAME
// engine modules the browser app uses, then encodes with ffmpeg.
//
// Setup:   npm i @napi-rs/canvas @ffmpeg-installer/ffmpeg @fontsource/anton
// Usage:   node tools/render.mjs [--aspect 16:9|9:16|1:1] [--fps 30] [--out out.mp4]
//
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const aspect = arg('aspect', '16:9');
const fps = parseInt(arg('fps', '30'), 10);
const outFile = resolve(ROOT, arg('out', `output/kinetic-${aspect.replace(':', 'x')}.mp4`));

// ── font ─────────────────────────────────────────────────────────────────────
const fontCandidates = [
  join(ROOT, 'fonts', 'Anton-Regular.ttf'),
  join(ROOT, 'fonts', 'anton-latin-400-normal.woff2'),
  require.resolve('@fontsource/anton/files/anton-latin-400-normal.woff2'),
];
const fontPath = fontCandidates.find(p => { try { require('node:fs').accessSync(p); return true; } catch { return false; } });
if (!fontPath) { console.error('No Anton font found. npm i @fontsource/anton or drop fonts/Anton-Regular.ttf'); process.exit(1); }
GlobalFonts.registerFromPath(fontPath, 'Anton');

// ── browser shims for the engine modules ─────────────────────────────────────
globalThis.document = { createElement: () => createCanvas(8, 8) };
globalThis.window = globalThis;

const { Engine } = await import(join(ROOT, 'js/engine.js'));
const { parseLyricText, autoTime } = await import(join(ROOT, 'js/lyrics.js'));
const { DEMO_LYRICS, DEFAULT_SETTINGS } = await import(join(ROOT, 'js/demo.js'));

// ── project ──────────────────────────────────────────────────────────────────
const S = structuredClone(DEFAULT_SETTINGS);
S.aspect = aspect;
const lines = parseLyricText(DEMO_LYRICS);
autoTime(lines, S.motion.bpm, S.motion.offsetSec, S.motion.barsPerLine);

const canvas = createCanvas(1920, 1080);
const engine = new Engine(canvas);
engine.resize(aspect);
engine.setProject(lines, S);

const duration = engine.duration;
const totalFrames = Math.ceil(duration * fps);
const frameDir = join(tmpdir(), `kinetic-frames-${aspect.replace(':', 'x')}-${Date.now()}`);
mkdirSync(frameDir, { recursive: true });
mkdirSync(dirname(outFile), { recursive: true });

console.log(`rendering ${aspect} @ ${fps}fps — ${totalFrames} frames, ${duration.toFixed(1)}s`);

const beat = 60 / S.motion.bpm;
const t0 = Date.now();
for (let i = 0; i < totalFrames; i++) {
  const t = i / fps;
  const bp = (t - S.motion.offsetSec) / beat;
  const pulse = bp >= 0 ? Math.pow(1 - (bp - Math.floor(bp)), 3) : 0;
  engine.render(t, 1 / fps, pulse);
  writeFileSync(join(frameDir, `f${String(i).padStart(5, '0')}.png`), canvas.toBuffer('image/png'));
  if (i % 60 === 0) console.log(`  frame ${i}/${totalFrames} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
console.log(`frames done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ── beat audio (mirrors Transport synth, offline) ────────────────────────────
const SR = 44100;
const nSamples = Math.ceil((duration + 0.4) * SR);
const mix = new Float64Array(nSamples);
const eighth = beat / 2;

const addKick = (at, vol) => {
  const i0 = Math.round(at * SR), len = Math.round(0.28 * SR);
  let phase = 0;
  for (let i = 0; i < len && i0 + i < nSamples; i++) {
    const x = i / SR;
    const f = x < 0.12 ? 140 * Math.pow(42 / 140, x / 0.12) : 42;
    phase += (2 * Math.PI * f) / SR;
    const env = vol * 0.9 * Math.exp((Math.log(0.001) * x) / 0.26);
    mix[i0 + i] += Math.sin(phase) * env;
  }
};
let noiseState = 0;
const noise = () => Math.random() * 2 - 1;
// one-pole bandpass-ish via lp/hp mix (good enough for a guide groove)
const addSnare = (at, vol) => {
  const i0 = Math.round(at * SR), len = Math.round(0.18 * SR);
  let lp = 0;
  for (let i = 0; i < len && i0 + i < nSamples; i++) {
    const x = i / SR;
    const n = noise();
    lp += 0.35 * (n - lp); // low-pass the noise
    const hp = n - lp;     // high remainder ≈ bandpass emphasis
    const env = vol * Math.exp((Math.log(0.001) * x) / 0.16);
    const body = Math.sin(2 * Math.PI * 190 * x) * vol * 0.4 * Math.exp(-x / 0.08);
    mix[i0 + i] += (hp * 0.8 + lp * 0.3) * env + body;
  }
};
const addHat = (at, vol) => {
  const i0 = Math.round(at * SR), len = Math.round(0.06 * SR);
  let prev = 0;
  for (let i = 0; i < len && i0 + i < nSamples; i++) {
    const x = i / SR;
    const n = noise();
    const hp = n - prev; prev = n; // crude high-pass
    mix[i0 + i] += hp * vol * Math.exp((Math.log(0.001) * x) / 0.05);
  }
};

if (S.motion.demoBeat) {
  for (let h = 0; ; h++) {
    const at = S.motion.offsetSec + h * eighth;
    if (at >= duration) break;
    const inBar = Math.floor(h / 2) % 4;
    if (h % 2 === 0) {
      if (inBar === 0 || inBar === 2) addKick(at, inBar === 0 ? 1 : 0.82);
      else addSnare(at, 0.5);
    }
    addHat(at, h % 2 ? 0.22 : 0.10);
    if (inBar === 0 && h % 8 === 0) addHat(at + eighth * 0.75, 0.16);
  }
}
// master fade on the tail
const fadeStart = nSamples - Math.round(0.5 * SR);
for (let i = fadeStart; i < nSamples; i++) mix[i] *= Math.max(0, (nSamples - i) / (nSamples - fadeStart));
// normalize + write 16-bit stereo WAV
let peak = 0; for (let i = 0; i < nSamples; i++) peak = Math.max(peak, Math.abs(mix[i]));
const gain = peak > 0 ? 0.88 / peak : 1;
const wav = Buffer.alloc(44 + nSamples * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + nSamples * 4, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(nSamples * 4, 40);
for (let i = 0; i < nSamples; i++) {
  const v = Math.max(-1, Math.min(1, mix[i] * gain));
  const s = Math.round(v * 32767);
  wav.writeInt16LE(s, 44 + i * 4); wav.writeInt16LE(s, 46 + i * 4);
}
const wavPath = join(frameDir, 'beat.wav');
writeFileSync(wavPath, wav);
console.log('audio synthesized');

// ── encode ───────────────────────────────────────────────────────────────────
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
const first = `f${String(0).padStart(5, '0')}.png`;
execFileSync(ffmpeg, [
  '-y', '-framerate', String(fps), '-i', join(frameDir, 'f%05d.png'), '-i', wavPath,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
  outFile,
], { stdio: ['ignore', 'inherit', 'inherit'] });

rmSync(frameDir, { recursive: true, force: true });
const mb = (require('node:fs').statSync(outFile).size / 1048576).toFixed(2);
console.log(`✓ ${outFile} (${mb} MB, ${duration.toFixed(1)}s)`);
