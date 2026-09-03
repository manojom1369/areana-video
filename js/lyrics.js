// ─── lyrics.js — lyric parsing + timing model ────────────────────────────────
//
// Line:  { start, end, words: [Word] }
// Word:  { text, emph (bool), caps (bool), t (start sec), d (duration sec) }
//
// Emphasis syntax: *word* gets accent treatment. ALLCAPS words too.
import { srtParseTime } from './util.js';

export function parseLyricText(raw) {
  const lines = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const text = rawLine.trim();
    if (!text) continue;
    if (/^\[.*\]$/.test(text) || /^<\d+:\d+/.test(text)) continue; // metadata tags
    const words = tokenize(text);
    if (words.length) lines.push({ start: null, end: null, words, text });
  }
  return lines;
}

export function tokenize(line) {
  return line.split(/\s+/).filter(Boolean).map(tok => {
    let emph = false, text = tok;
    if (/^\*.*\*$/.test(text) && text.length > 2) { emph = true; text = text.slice(1, -1); }
    else if (text.startsWith('*')) { emph = true; text = text.slice(1); }
    else if (text.endsWith('*') && text.length > 1) { emph = true; text = text.slice(0, -1); }
    const caps = text.length > 1 && text === text.toUpperCase() && /[A-Z\u00C0-\u024F]/.test(text);
    // strip surrounding punctuation from the caps check keeps caps flag, text as-is
    return { text, emph, caps, t: 0, d: 0.4 };
  });
}

// distribute word timings inside [start, end]; words weighted by length
export function timeWords(line, start, end, singFraction = 0.72) {
  const sing = Math.max(0.3, (end - start) * singFraction);
  const weights = line.words.map(w => Math.max(2, w.text.replace(/[^\p{L}\p{N}]/gu, '').length));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = start;
  line.words.forEach((w, i) => {
    const d = sing * weights[i] / total;
    w.t = t; w.d = d;
    t += d;
  });
  line.start = start; line.end = end;
}

// fill line end times (end = next.start - gap), used after tap/import
export function finalizeLines(lines, gap = 0.10, lastDur = 2.6) {
  lines.forEach((L, i) => {
    const next = lines[i + 1];
    const end = next && next.start != null ? next.start - gap : L.start + lastDur;
    L.end = Math.max(L.start + 0.6, end);
    if (!L._wordsTimed) timeWords(L, L.start, L.end);
  });
  return lines;
}

// auto-time by BPM: one line every N bars
export function autoTime(lines, bpm, offsetSec, barsPerLine = 1) {
  const beat = 60 / bpm;
  const step = beat * 4 * barsPerLine;
  lines.forEach((L, i) => { L.start = offsetSec + i * step; L.end = null; });
  return finalizeLines(lines);
}

// ── LRC (+ enhanced word tags) ───────────────────────────────────────────────
export function parseLRC(text) {
  const lines = [];
  const timeTag = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g;
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(timeTag)].map(m => +m[1] * 60 + parseFloat(m[2].replace(':', '.')));
    if (!stamps.length) continue;
    let content = raw.replace(timeTag, '').trim();
    if (!content) continue;
    // enhanced: <mm:ss.xx>word
    const wordTags = [...content.matchAll(/<(\d+):(\d+(?:[.:]\d+)?)>([^<]+)/g)];
    if (wordTags.length) {
      const words = wordTags.map(m => {
        const w = tokenize(m[3].trim())[0] || { text: m[3].trim() };
        w.t = +m[1] * 60 + parseFloat(m[2].replace(':', '.'));
        return w;
      });
      for (let i = 0; i < words.length; i++) words[i].d = (words[i + 1]?.t ?? words[i].t + 0.5) - words[i].t;
      const L = { start: words[0].t, end: null, words, text: content.replace(/<[^>]+>/g, ''), _wordsTimed: true };
      lines.push(L);
    } else {
      const L = { start: stamps[0], end: null, words: tokenize(content), text: content };
      lines.push(L);
    }
  }
  lines.sort((a, b) => a.start - b.start);
  return finalizeLines(lines);
}

// ── SRT ──────────────────────────────────────────────────────────────────────
export function parseSRT(text) {
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  const lines = [];
  for (const b of blocks) {
    const m = b.match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})/);
    if (!m) continue;
    const rows = b.split(/\n/);
    const ti = rows.findIndex(r => r.includes('-->'));
    const txt = rows.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
    if (!txt) continue;
    const start = srtParseTime(m[1]), end = srtParseTime(m[2]);
    const words = tokenize(txt);
    const L = { start, end, words, text: txt };
    timeWords(L, start, end, 1);
    L._wordsTimed = true;
    lines.push(L);
  }
  return lines;
}

export function toSRT(lines) {
  const pad = (n, w) => String(n).padStart(w, '0');
  const fmt = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(sec, 2)},${pad(ms, 3)}`;
  };
  return lines.map((L, i) =>
    `${i + 1}\n${fmt(L.start)} --> ${fmt(L.end)}\n${L.words.map(w => w.text).join(' ')}\n`
  ).join('\n');
}

export function projectDuration(lines) {
  if (!lines.length) return 8;
  return lines[lines.length - 1].end + 2.2;
}
