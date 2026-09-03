// ─── util.js — shared helpers ────────────────────────────────────────────────
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const fract = (v) => v - Math.floor(v);
export const mix = (c1, c2, t) => {
  // hex color mix
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(c1), [r2, g2, b2] = p(c2);
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(lerp(r1, r2, t))}${h(lerp(g1, g2, t))}${h(lerp(b1, b2, t))}`;
};
export const rgba = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

// easings
export const easeOutExpo = (t) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeOutBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// deterministic rng (for glitch seeds)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${ms}`;
};

export const srtTime = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

export const srtParseTime = (str) => {
  const m = str.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/) || str.trim().match(/(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  if (m.length === 5) return +m[1] * 3600 + +m[2] * 60 + +m[3] + +('0.' + m[4]);
  return +m[1] * 60 + +m[2] + +('0.' + m[3]);
};

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];

export function download(filename, blobOrUrl) {
  const a = document.createElement('a');
  a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const debounce = (fn, ms = 300) => {
  let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
};
