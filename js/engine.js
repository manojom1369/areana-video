// ─── engine.js — canvas render engine: layout, camera, backgrounds, overlays ─
import { clamp, fract, lerp, rgba, easeOutCubic, mulberry32, TAU } from './util.js';
import { STYLES } from './styles.js';

export const FONT_WEIGHT = {
  'Anton': 400, 'Archivo Black': 400, 'Bebas Neue': 400,
  'Inter': 900, 'Space Grotesk': 700, 'JetBrains Mono': 700,
};

const ASPECTS = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.S = null;            // settings (set by main)
    this.lines = [];
    this.W = 1920; this.H = 1080;
    this._layoutKey = '';
    this._layout = null;
    this._scratch = null;
    this._noiseTile = null;
    this._particles = null;
    this._t = 0; this._dt = 1 / 60;
  }

  setProject(lines, settings) {
    this.lines = lines; this.S = settings;
    this._layoutKey = '';
    this._particles = null;
  }

  resize(aspect) {
    const [w, h] = ASPECTS[aspect] || ASPECTS['16:9'];
    this.W = w; this.H = h;
    this.canvas.width = w; this.canvas.height = h;
    this._layoutKey = ''; this._particles = null;
  }

  lineAt(t) {
    for (const L of this.lines) {
      if (L.start == null || L.end == null) continue;
      if (t >= L.start - 0.02 && t <= L.end + 0.02) return L;
    }
    return null;
  }

  // ── text layout ────────────────────────────────────────────────────────────
  layout(line, t) {
    const key = [line.start, line.text, this.S.style, this.S.font, this.S.uppercase, this.W, this.H].join('|');
    if (key === this._layoutKey) return this._layout;
    const ctx = this.ctx, S = this.S;
    const weight = FONT_WEIGHT[S.font] || 700;
    const text = (w) => S.uppercase ? w.toUpperCase() : w;
    let size = Math.min(this.W, this.H) * (this.W > this.H ? 0.088 : 0.082);
    const maxW = this.W * 0.84;
    const maxRows = this.W > this.H ? 3 : 4;
    let rows;
    for (let iter = 0; iter < 10; iter++) {
      ctx.font = `${weight} ${size}px "${S.font}", "Inter", sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * 0.02}px`;
      const spaceW = ctx.measureText(' ').width;
      const words = line.words.map(w => ({
        w, text: text(w.text), px: ctx.measureText(text(w.text)).width, x: 0, y: 0,
        chars: [],
      }));
      rows = [];
      let cur = [], curW = -spaceW;
      for (const item of words) {
        if (cur.length && curW + spaceW + item.px > maxW) { rows.push({ words: cur, w: curW }); cur = []; curW = -spaceW; }
        cur.push(item); curW += (cur.length > 1 ? spaceW : 0) + item.px;
      }
      if (cur.length) rows.push({ words: cur, w: curW });
      if (rows.length <= maxRows) break;
      size *= 0.87;
    }
    // position rows/words/chars
    const lineH = size * 1.22;
    const centerY = this.W > this.H ? this.H * 0.5 : this.H * 0.42;
    const y0 = centerY - (rows.length - 1) * lineH / 2;
    rows.forEach((row, r) => {
      let x = (this.W - row.w) / 2;
      const y = y0 + r * lineH;
      for (const item of row.words) {
        item.x = x; item.y = y;
        // char positions relative to word start
        let cx = 0;
        for (const ch of item.text) {
          const cw = ctx.measureText(ch).width;
          item.chars.push({ ch, x: cx, w: cw });
          cx += cw;
        }
        x += item.px + (ctx.measureText(' ').width);
      }
    });
    this._layout = { rows, size, lineH, centerY };
    this._layoutKey = key;
    return this._layout;
  }

  // ── frame ──────────────────────────────────────────────────────────────────
  render(t, dt, pulse) {
    this._t = t; this._dt = dt;
    const ctx = this.ctx, S = this.S, W = this.W, H = this.H;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    this.drawBackground(t, pulse);

    // camera: beat zoom + shake
    const line = this.lineAt(t);
    const m = S.motion;
    const zoom = 1 + m.zoom * pulse;
    const shk = m.shake * pulse * 16;
    const rng = mulberry32(Math.floor(t * 61));
    const sx = (rng() - 0.5) * 2 * shk, sy = (rng() - 0.5) * 2 * shk;
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    if (line) {
      const lay = this.layout(line, t);
      const enter = clamp((t - line.start) / Math.max(0.05, m.enterMs / 1000), 0, 1);
      const exit = clamp((line.end - t) / Math.max(0.05, m.exitMs / 1000), 0, 1);
      const info = {
        t, dt, pulse, line, lay, W, H, S,
        enter, exit,
        ctx: this,
        accent: S.palette.accent, text: S.palette.text,
        font: (sz) => { ctx.font = `${FONT_WEIGHT[S.font] || 700} ${sz}px "${S.font}", "Inter", sans-serif`; },
      };
      ctx.save();
      (STYLES[S.style] || STYLES.punch).draw(ctx, info);
      ctx.restore();
    }
    ctx.restore();

    if (S.vignette) this.drawVignette();
    if (S.grain) this.drawGrain(t);
    if (S.progress) this.drawProgress(t);
    ctx.restore();
  }

  get duration() {
    return this.lines.length ? this.lines[this.lines.length - 1].end + 2.2 : 10;
  }

  // ── backgrounds ────────────────────────────────────────────────────────────
  drawBackground(t, pulse) {
    const ctx = this.ctx, W = this.W, H = this.H, P = this.S.palette;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.bg2); g.addColorStop(1, P.bg1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const kind = this.S.bg;
    if (kind === 'aurora' || kind === 'particles') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i++) {
        const a = t * (0.11 + i * 0.05) + i * 2.1;
        const x = W * (0.5 + 0.34 * Math.cos(a * (0.8 + i * 0.26)));
        const y = H * (0.5 + 0.3 * Math.sin(a * (1.1 - i * 0.2)));
        const r = Math.min(W, H) * (0.42 + 0.1 * pulse);
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, rgba(P.accent, 0.14 + 0.1 * pulse));
        rg.addColorStop(1, rgba(P.accent, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    if (kind === 'grid') {
      ctx.save();
      const hz = H * 0.62;
      const glow = ctx.createLinearGradient(0, hz - 90, 0, hz + 30);
      glow.addColorStop(0, rgba(P.accent, 0));
      glow.addColorStop(1, rgba(P.accent, 0.22 + 0.15 * pulse));
      ctx.fillStyle = glow; ctx.fillRect(0, hz - 90, W, 122);
      ctx.strokeStyle = rgba(P.accent, 0.30); ctx.lineWidth = 2;
      const vpx = W / 2;
      for (let i = -10; i <= 10; i++) {
        ctx.beginPath(); ctx.moveTo(vpx + i * 40, hz); ctx.lineTo(vpx + i * 320, H); ctx.stroke();
      }
      const scroll = fract(t * 0.5);
      for (let j = 0; j < 14; j++) {
        const p = (j + scroll) / 14; // 0..1
        const y = hz + Math.pow(p, 2.4) * (H - hz);
        ctx.globalAlpha = clamp(p * 1.6, 0.08, 0.5) * (1 + pulse * 0.6);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();
    }
    if (kind === 'particles') this.drawParticles(t, pulse);
    if (kind === 'flat') {
      ctx.fillStyle = rgba('#000000', 0.12 * pulse); ctx.fillRect(0, 0, W, H);
    }
  }

  drawParticles(t, pulse) {
    if (!this._particles) {
      const rng = mulberry32(42);
      this._particles = Array.from({ length: 110 }, () => ({
        x: rng(), y: rng(), s: 0.6 + rng() * 2.4, v: 0.01 + rng() * 0.035, ph: rng() * TAU,
      }));
    }
    const ctx = this.ctx, W = this.W, H = this.H, P = this.S.palette;
    ctx.save();
    ctx.fillStyle = P.text;
    for (const p of this._particles) {
      const y = fract(p.y - t * p.v);
      const x = fract(p.x + Math.sin(t * 0.3 + p.ph) * 0.01);
      const a = 0.1 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2 + p.ph)) + pulse * 0.12;
      ctx.globalAlpha = clamp(a, 0, 0.5);
      const sz = p.s * (1 + 0.5 * pulse);
      ctx.beginPath(); ctx.arc(x * W, y * H, sz, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawVignette() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  drawGrain(t) {
    if (!this._noiseTile) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const nctx = c.getContext('2d');
      const img = nctx.createImageData(256, 256);
      const rng = mulberry32(7);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 110 + rng() * 90;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      nctx.putImageData(img, 0, 0);
      this._noiseTile = c;
    }
    const ctx = this.ctx, rng = mulberry32(Math.floor(t * 47));
    const ox = -rng() * 256, oy = -rng() * 256;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.05;
    const pat = ctx.createPattern(this._noiseTile, 'repeat');
    ctx.translate(ox, oy);
    ctx.fillStyle = pat;
    ctx.fillRect(-ox, -oy, this.W + 256, this.H + 256);
    ctx.restore();
  }

  drawProgress(t) {
    const ctx = this.ctx, W = this.W, H = this.H, P = this.S.palette;
    const bw = W * 0.5, x = (W - bw) / 2, y = H - Math.round(H * 0.055);
    const p = clamp(t / Math.max(1, this.duration), 0, 1);
    ctx.fillStyle = rgba(P.text, 0.14);
    this.roundRect(x, y, bw, 4, 2); ctx.fill();
    ctx.fillStyle = P.accent;
    this.roundRect(x, y, Math.max(6, bw * p), 4, 2); ctx.fill();
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // scratch offscreen for glitch-style word isolation
  getScratch(w, h) {
    if (!this._scratch) this._scratch = document.createElement('canvas');
    if (this._scratch.width !== w || this._scratch.height !== h) { this._scratch.width = w; this._scratch.height = h; }
    return this._scratch;
  }
}
