// ─── main.js — orchestration: state, render loop, persistence ────────────────
import { Transport } from './transport.js';
import { Engine } from './engine.js';
import { initUI } from './ui.js';
import { fract } from './util.js';
import { parseLyricText, autoTime, projectDuration } from './lyrics.js';
import { DEMO_LYRICS, DEMO_TITLE, DEFAULT_SETTINGS } from './demo.js';

const STORE_KEY = 'kinetic-lyric-studio-v1';

const transport = new Transport();
const engine = new Engine(document.getElementById('stage'));

// ── state ────────────────────────────────────────────────────────────────────
let S = structuredClone(DEFAULT_SETTINGS);
let lines = [];
let lyricText = DEMO_LYRICS;

(function restore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    S = { ...structuredClone(DEFAULT_SETTINGS), ...saved, motion: { ...DEFAULT_SETTINGS.motion, ...(saved.motion || {}) }, palette: { ...DEFAULT_SETTINGS.palette, ...(saved.palette || {}) } };
    if (saved.lyricText) lyricText = saved.lyricText;
  } catch (e) { /* fresh start */ }
})();

const app = {
  transport, engine, S,
  get lines() { return lines; },
  get lyricText() { return lyricText; },
  set lyricText(v) { lyricText = v; },
  get duration() { return projectDuration(lines); },

  touch() {
    engine.setProject(lines, S);
    save();
  },

  setLines(newLines, mode) {
    lines = newLines;
    S.timingMode = mode;
    transport.virtualDuration = projectDuration(lines);
    transport.seek(Math.min(transport.time, transport.virtualDuration));
    engine.setProject(lines, S);
    this.refreshList?.();
    this.updateSeekMax?.();
    save();
  },

  applyLyrics(text) {
    lyricText = text;
    const parsed = parseLyricText(text);
    if (!parsed.length) { lines = []; this.setLines([], 'auto'); return; }
    autoTime(parsed, S.motion.bpm, S.motion.offsetSec, S.motion.barsPerLine);
    this.setLines(parsed, 'auto');
  },

  retime() { // re-grid lines whose timing came from auto mode
    if (S.timingMode !== 'auto' || !lines.length) { this.touch(); return; }
    autoTime(lines, S.motion.bpm, S.motion.offsetSec, S.motion.barsPerLine);
    this.setLines(lines, 'auto');
  },

  nudge(d) {
    lines.forEach(L => {
      L.start += d; L.end += d;
      L.words.forEach(w => { w.t += d; });
    });
    engine.setProject(lines, S);
    this.refreshList?.();
    save();
  },

  selectStyle(id) {
    S.style = id;
    document.querySelectorAll('.style-card').forEach(c => c.classList.toggle('active', c.dataset.style === id));
    engine._layoutKey = '';
    this.touch();
    this.meta?.();
  },

  loadDemo() {
    S = structuredClone(DEFAULT_SETTINGS);
    lyricText = DEMO_LYRICS;
    S.title = DEMO_TITLE;
    localStorage.removeItem(STORE_KEY);
    location.reload();
  },

  updateSeekMax() {
    const seek = document.getElementById('seek');
    if (seek) seek.max = Math.max(1, this.duration);
  },
};

const save = debounce(() => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...S, lyricText }));
  } catch (e) { /* storage full — ignore */ }
}, 400);

// ── boot ─────────────────────────────────────────────────────────────────────
engine.resize(S.aspect);
app.applyLyrics(lyricText);          // demo/lyrics → auto-timed lines
transport.bpm = S.motion.bpm;
transport.offset = S.motion.offsetSec;
transport.synthOn = S.motion.demoBeat;
document.title = `${S.title} — Kinetic Lyric Studio`;

initUI(app);

// keep synth tempo in sync when bpm changes
let lastBpm = S.motion.bpm;
let lastOffset = S.motion.offsetSec;

// re-layout once webfonts arrive
document.fonts?.ready.then(() => { engine._layoutKey = ''; });

// ── render loop ──────────────────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = transport.time;

  if (lastBpm !== S.motion.bpm) { lastBpm = S.motion.bpm; transport.bpm = S.motion.bpm; }
  if (lastOffset !== S.motion.offsetSec) { lastOffset = S.motion.offsetSec; transport.offset = S.motion.offsetSec; }

  // beat pulse: audio-reactive (FFT bass) or BPM grid
  let pulse = 0;
  if (S.motion.reactive && transport.hasAudio) {
    pulse = transport.envelope();
  } else {
    const beat = 60 / Math.max(40, S.motion.bpm);
    const bp = (t - S.motion.offsetSec) / beat;
    if (bp >= 0) pulse = Math.pow(1 - fract(bp), 3);
  }

  engine.render(t, dt, pulse);
  app.uiTick?.(t, pulse);

  // auto-pause at project end when no song is loaded
  if (!transport.hasAudio && transport.playing && t >= app.duration) {
    transport.pause(); app.syncPlayIcon?.();
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
