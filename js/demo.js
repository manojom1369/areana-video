// ─── demo.js — starter project ───────────────────────────────────────────────
export const DEMO_TITLE = 'Yeshanagula Kattameedha — Uyyala';

export const DEMO_LYRICS = `Yeshanagula kattameedha yeshina *uyyala*
Manamvugudhame *baala*
Yeshanagula kattameedha yeshina *uyyala*
Manamvugudhame *baala*`;

export const DEFAULT_SETTINGS = {
  title: DEMO_TITLE,
  style: 'punch',
  font: 'Anton',
  uppercase: true,
  bg: 'aurora',
  vignette: true,
  grain: true,
  progress: true,
  aspect: '16:9',
  palette: { bg1: '#180a1c', bg2: '#3d1130', accent: '#ff7a59', text: '#fff2ec' },
  motion: {
    bpm: 96, offsetSec: 0.6, barsPerLine: 1,
    zoom: 0.03, shake: 0.08, enterMs: 260, exitMs: 280,
    reactive: false, demoBeat: true,
  },
};

export const PALETTES = [
  { name: 'Midnight', bg1: '#070b18', bg2: '#101a38', accent: '#6ee7ff', text: '#f2f6ff' },
  { name: 'Sunset',   bg1: '#180a1c', bg2: '#3d1130', accent: '#ff7a59', text: '#fff2ec' },
  { name: 'Toxic',    bg1: '#06140c', bg2: '#0e2b1a', accent: '#a3ff5e', text: '#f0fff4' },
  { name: 'Mono',     bg1: '#0a0a0a', bg2: '#1d1d1d', accent: '#ffffff', text: '#eaeaea' },
  { name: 'Ice',      bg1: '#0c1a24', bg2: '#14384d', accent: '#7fd4ff', text: '#eaf7ff' },
  { name: 'Blood',    bg1: '#140505', bg2: '#33100d', accent: '#ff3b3b', text: '#ffeee9' },
];
