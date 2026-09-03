// ─── styles.js — kinetic typography renderers (one per preset) ───────────────
// Each style: { id, name, blurb, draw(ctx, I) }
// I = { t, dt, pulse, line, lay:{rows,size,lineH,centerY}, W, H, S, enter, exit,
//       accent, text, font(size), ctx:engine }
import { clamp, lerp, rgba, easeOutExpo, easeOutQuint, easeOutCubic, easeInCubic, easeOutBack, mulberry32, TAU } from './util.js';

const wordP = (w, t) => clamp((t - w.t) / Math.max(w.d, 0.001), 0, 1);
const isSung = (w, t) => t >= w.t + w.d;
const isActive = (w, t) => t >= w.t && t < w.t + w.d;
const groupAlpha = (I) => Math.min(1, I.enter * 1.5) * clamp(I.exit * 1.35, 0, 1);

function eachWord(lay, fn) {
  let gi = 0;
  for (const row of lay.rows) for (const item of row.words) fn(item, gi++);
}

// ─── 1. PUNCH — words slam in with overshoot, active word pops on the beat ────
// Impact package: squash & stretch on landing, shockwave ring, spark burst +
// speed-lines on emphasized words, ghost motion-echo, hard offset shadow.
const punch = {
  id: 'punch', name: 'Punch', blurb: 'Slams + shockwaves · hip-hop / EDM',
  draw(ctx, I) {
    const { t, pulse, lay, W, enter, exit } = I;
    const a = groupAlpha(I);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    const gy = (1 - easeOutCubic(enter)) * 20 - easeInCubic(1 - exit) * 30;
    const gs = lerp(0.96, 1, easeOutBack(enter)) * lerp(1, 0.96, easeInCubic(1 - exit));
    ctx.save();
    ctx.translate(W / 2, lay.centerY + gy);
    ctx.scale(gs, gs);
    ctx.translate(-W / 2, -lay.centerY);
    ctx.textAlign = 'center';
    I.font(lay.size);

    eachWord(lay, (item, wi) => {
      const w = item.w, p = wordP(w, t);
      const hot = !!(w.emph || w.caps);
      const cx = item.x + item.px / 2, cy = item.y;

      // impact envelopes
      const hitE = 1 - easeOutExpo(Math.min(1, p / 0.55));   // slam energy
      const squash = Math.max(0, 1 - p / 0.28);               // landing squash
      const rng = mulberry32((wi + 1) * 733 + Math.floor((w.t + 0.31) * 97));

      let scale = hot ? 1.05 : 1, alpha = 0.30, fill = I.text, dy = 0, rot = 0;
      if (isActive(w, t)) {
        scale = (1 + 0.55 * hitE + 0.05 * pulse) * (hot ? 1.05 : 1);
        alpha = 0.35 + 0.65 * easeOutCubic(p);
        dy = -lay.size * 0.22 * hitE;
        rot = (wi % 2 ? 1 : -1) * 0.05 * hitE * (hot ? 1.4 : 1);
        fill = hot ? I.accent : I.text;
      } else if (isSung(w, t)) {
        alpha = 1; fill = hot ? I.accent : I.text;
      }
      const sx = scale * (1 + 0.10 * squash);
      const sy = scale * (1 - 0.16 * squash);

      // ── shockwave ring + fan lines + sparks (behind text) ──
      if (isActive(w, t) && p < 0.6) {
        const q = p / 0.6;
        const rx = item.px / 2 + lay.size * (0.25 + 0.85 * q);
        const ry = lay.size * (0.5 + 0.6 * q);
        ctx.save();
        ctx.translate(cx, cy + dy);
        ctx.globalAlpha = a * (1 - q) * (hot ? 0.55 : 0.26);
        ctx.strokeStyle = hot ? I.accent : I.text;
        ctx.lineWidth = Math.max(1, lay.size * 0.055 * (1 - q));
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
        ctx.stroke();
        if (hot) {
          // speed-lines fanning off the hit
          ctx.globalAlpha = a * (1 - q) * 0.4;
          ctx.lineWidth = Math.max(1, lay.size * 0.03);
          for (let s = 0; s < 7; s++) {
            const ang = (s / 7) * TAU + rng() * 0.5;
            const r0 = rx * 0.95;
            const r1 = r0 + lay.size * (0.12 + 0.22 * rng()) * (1 - q);
            ctx.beginPath();
            ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * ry * 0.95);
            ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * ry * 1.05);
            ctx.stroke();
          }
          // spark burst
          const q2 = Math.min(1, p / 0.5);
          ctx.fillStyle = I.accent;
          for (let s = 0; s < 6; s++) {
            const ang = rng() * TAU;
            const dist = lay.size * (0.3 + 0.9 * q2);
            ctx.globalAlpha = a * (1 - q2) * 0.7;
            ctx.beginPath();
            ctx.arc(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.55,
              Math.max(1, lay.size * 0.028 * (1 - q2)), 0, TAU);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // ── ghost motion-echo while slamming ──
      if (hitE > 0.06) {
        ctx.save();
        ctx.translate(cx, cy + dy * 1.35);
        ctx.rotate(rot * 1.4);
        ctx.scale(sx * 1.14, sy * 1.14);
        ctx.globalAlpha = a * 0.16 * hitE;
        ctx.fillStyle = fill;
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
      }

      // ── hard offset shadow ──
      if (alpha > 0.5) {
        const off = lay.size * 0.045 + 3 + pulse * 2;
        ctx.save();
        ctx.translate(cx + off * 0.55, cy + dy + off);
        ctx.rotate(rot);
        ctx.scale(sx, sy);
        ctx.globalAlpha = a * 0.5 * alpha;
        ctx.fillStyle = hot ? rgba(I.accent, 0.55) : 'rgba(0,0,0,0.5)';
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
      }

      // ── main pass ──
      ctx.save();
      ctx.translate(cx, cy + dy);
      ctx.rotate(rot);
      ctx.scale(sx, sy);
      ctx.globalAlpha = a * alpha;
      ctx.fillStyle = fill;
      ctx.fillText(item.text, 0, 0);
      ctx.restore();
    });
    ctx.restore();
  },
};

// ─── 2. FOCUS — Apple-Music-style blur pull-into-focus ───────────────────────
const focus = {
  id: 'focus', name: 'Blur Focus', blurb: 'Cinematic blur → focus · pop ballads',
  draw(ctx, I) {
    const { t, lay, pulse } = I;
    const a = groupAlpha(I);
    if (a <= 0) return;
    ctx.textAlign = 'center';
    I.font(lay.size);
    eachWord(lay, (item) => {
      const w = item.w, p = wordP(w, t);
      const cx = item.x + item.px / 2;
      ctx.save();
      if (isActive(w, t)) {
        const e = easeOutExpo(p);
        ctx.filter = `blur(${(1 - e) * lay.size * 0.09}px)`;
        ctx.translate(cx, item.y);
        const s = 1 + 0.05 * (1 - e) + 0.025 * pulse;
        ctx.scale(s, s);
        ctx.globalAlpha = a * (0.45 + 0.55 * e);
        ctx.fillStyle = I.accent;
        ctx.fillText(item.text, 0, 0);
      } else if (isSung(w, t)) {
        ctx.translate(cx, item.y);
        ctx.globalAlpha = a * 0.95;
        ctx.fillStyle = I.text;
        ctx.fillText(item.text, 0, 0);
        // accent underline slide-out after the word is sung
        if (w.emph || w.caps) {
          ctx.globalAlpha = a * 0.85;
          ctx.fillStyle = I.accent;
          const uw = item.px * 0.7;
          ctx.fillRect(-uw / 2, lay.size * 0.52, uw, Math.max(3, lay.size * 0.035));
        }
      } else {
        ctx.filter = `blur(${lay.size * 0.055}px)`;
        ctx.translate(cx, item.y);
        ctx.globalAlpha = a * 0.42;
        ctx.fillStyle = I.text;
        ctx.fillText(item.text, 0, 0);
      }
      ctx.restore();
      ctx.filter = 'none';
    });
  },
};

// ─── 3. GLITCH — RGB split + slice jitter on the active word ──────────────────
const glitch = {
  id: 'glitch', name: 'Glitch', blurb: 'RGB split + slice tears · drill / hyperpop',
  draw(ctx, I) {
    const { t, lay, W, S } = I;
    const a = groupAlpha(I);
    if (a <= 0) return;
    const beatDur = 60 / Math.max(40, S.motion.bpm);
    const beatIdx = Math.floor((t - (S.motion.offsetSec || 0)) / beatDur);
    ctx.textAlign = 'center';
    I.font(lay.size);
    eachWord(lay, (item, wi) => {
      const w = item.w, p = wordP(w, t);
      const cx = item.x + item.px / 2;
      const hot = w.emph || w.caps;
      if (isActive(w, t)) {
        const k = 1 - easeOutExpo(p);            // glitch energy decays as word completes
        const rng = mulberry32(beatIdx * 977 + wi * 131 + Math.floor(t * 30));
        const jx = (rng() - 0.5) * 10 * k;
        const off = 3 + 16 * k;
        ctx.save();
        ctx.translate(cx + jx, item.y + (rng() - 0.5) * 6 * k);
        ctx.globalAlpha = a * 0.85;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = '#ff2fd6';
        ctx.fillText(item.text, -off, 0);
        ctx.fillStyle = '#20e9ff';
        ctx.fillText(item.text, off, 0);
        ctx.restore();
        // white pass with torn slices
        ctx.save();
        ctx.translate(cx + jx, item.y + (rng() - 0.5) * 6 * k);
        ctx.globalAlpha = a;
        ctx.fillStyle = hot ? I.accent : I.text;
        if (k > 0.12) {
          for (let s = 0; s < 3; s++) {
            const sy = (rng() - 0.5) * lay.size * 0.8;
            const sh = lay.size * (0.08 + rng() * 0.16);
            const dx = (rng() - 0.5) * 44 * k;
            ctx.save();
            ctx.beginPath();
            ctx.rect(-item.px / 2 - 20, sy - sh / 2, item.px + 40, sh);
            ctx.clip();
            ctx.translate(dx, 0);
            ctx.fillText(item.text, 0, 0);
            ctx.restore();
          }
        }
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
      } else {
        ctx.save();
        ctx.translate(cx, item.y);
        ctx.globalAlpha = a * (isSung(w, t) ? 0.92 : 0.3);
        ctx.fillStyle = isSung(w, t) && hot ? I.accent : I.text;
        ctx.fillText(item.text, 0, 0);
        ctx.restore();
      }
    });
  },
};

// ─── 4. NEON — per-letter glow wave, letters rise as they're sung ─────────────
const neon = {
  id: 'neon', name: 'Neon Wave', blurb: 'Letter glow + wave · synthwave / pop',
  draw(ctx, I) {
    const { t, lay, pulse } = I;
    const a = groupAlpha(I);
    if (a <= 0) return;
    ctx.textAlign = 'left';
    I.font(lay.size);
    const grad = ctx.createLinearGradient(0, lay.centerY - lay.size, 0, lay.centerY + lay.size);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, I.accent);
    let gi = 0;
    for (const row of lay.rows) {
      for (const item of row.words) {
        const w = item.w;
        const sung = isSung(w, t), act = isActive(w, t);
        const baseY = item.y + Math.sin(t * 2.2 + gi * 0.5) * lay.size * 0.022;
        for (let ci = 0; ci < item.chars.length; ci++, gi++) {
          const c = item.chars[ci];
          const charT = w.t + (ci / item.chars.length) * w.d;
          const cp = clamp((t - charT) / 0.16, 0, 1);
          const e = easeOutExpo(cp);
          let y = baseY, alpha = a * 0.28, fill = I.text, glow = lay.size * 0.05, pop = 1;
          if (cp > 0) {
            y = baseY + (1 - e) * lay.size * 0.42;
            alpha = a * (0.3 + 0.7 * e);
          }
          if (cp >= 1 && act) {
            fill = grad;
            glow = lay.size * (0.28 + 0.25 * pulse);
            if (ci === item.chars.length - 1) pop = 1 + 0.1 * pulse;
          } else if (cp >= 1 && sung) {
            fill = I.text;
            glow = lay.size * 0.12;
            y = baseY + Math.sin(t * 2.2 + gi * 0.5) * lay.size * 0.018;
          }
          ctx.save();
          ctx.translate(item.x + c.x, y);
          ctx.scale(pop, pop);
          ctx.shadowColor = I.accent;
          ctx.shadowBlur = glow;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = fill;
          ctx.fillText(c.ch, 0, 0);
          ctx.restore();
        }
        gi++;
      }
    }
  },
};

// ─── 5. TYPE — typewriter with caret, chars land in sequence ──────────────────
const type = {
  id: 'type', name: 'Typewriter', blurb: 'Character-by-character + caret · lo-fi / storytelling',
  draw(ctx, I) {
    const { t, lay, line } = I;
    const a = groupAlpha(I);
    if (a <= 0) return;
    ctx.textAlign = 'left';
    I.font(lay.size);
    let caret = null;
    let lastChar = null;
    eachWord(lay, (item, wi) => {
      const w = item.w;
      for (let ci = 0; ci < item.chars.length; ci++) {
        const c = item.chars[ci];
        const charT = w.t + (ci / item.chars.length) * w.d;
        if (t < charT) { if (!caret) caret = { x: item.x + c.x, y: item.y }; return; }
        const fresh = clamp((t - charT) / 0.12, 0, 1);
        const e = easeOutExpo(fresh);
        lastChar = { x: item.x + c.x + c.w, y: item.y, fresh };
        ctx.save();
        ctx.translate(item.x + c.x + c.w / 2, item.y);
        ctx.globalAlpha = a * (0.4 + 0.6 * e);
        const isFresh = fresh < 1;
        ctx.fillStyle = isFresh ? I.accent : ((w.emph || w.caps) ? I.accent : I.text);
        if (isFresh) {
          const s = 1 + 0.35 * (1 - e);
          ctx.scale(s, s);
        }
        ctx.textAlign = 'center';
        ctx.fillText(c.ch, 0, 0);
        ctx.restore();
      }
    });
    // caret block
    const bx = caret ? caret.x : (lastChar ? lastChar.x : null);
    const by = caret ? caret.y : (lastChar ? lastChar.y : null);
    if (bx != null && I.exit > 0.25) {
      const blink = Math.sin(t * 9) > -0.2;
      if (blink) {
        ctx.save();
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = I.accent;
        ctx.fillRect(bx + lay.size * 0.08, by - lay.size * 0.34, lay.size * 0.14, lay.size * 0.68);
        ctx.restore();
      }
    }
  },
};

// ─── 6. CUT — masked slide-in, broadcast highlight box on active word ────────
const cut = {
  id: 'cut', name: 'Slide Cut', blurb: 'Masked slides + highlight box · lyric reels',
  draw(ctx, I) {
    const { t, lay, W, enter, exit } = I;
    const a = Math.min(1, I.enter * 2.5) * clamp(I.exit, 0, 1);
    if (a <= 0) return;
    const easeIn = easeOutQuint(enter);
    const easeOut = easeInCubic(1 - exit);
    const slideX = (1 - easeIn) * -W * 0.10 + easeOut * W * 0.14;
    ctx.save();
    ctx.globalAlpha = a;
    // reveal clip sweeping left→right
    const revealW = W * (0.15 + 0.85 * easeIn) * (1 - 0.85 * easeOut);
    ctx.beginPath();
    ctx.rect((W - revealW) / 2, 0, revealW, I.H);
    ctx.clip();
    ctx.translate(slideX, 0);
    ctx.rotate(-0.008);
    ctx.textAlign = 'left';
    I.font(lay.size);
    eachWord(lay, (item, wi) => {
      const w = item.w, p = wordP(w, t);
      // highlight box grows with the sung progress
      if (t >= w.t) {
        const bw = item.px * easeOutCubic(p) + lay.size * 0.06;
        ctx.fillStyle = (w.emph || w.caps) ? I.text : I.accent;
        ctx.fillRect(item.x - lay.size * 0.03, item.y - lay.size * 0.52, bw, lay.size * 1.04);
      }
      ctx.fillStyle = t >= w.t ? ((w.emph || w.caps) ? I.accent : I.text) : rgba(I.text, 0.35);
      ctx.fillText(item.text, item.x, item.y);
    });
    ctx.restore();
  },
};

export const STYLES = {
  punch, focus, glitch, neon, type, cut,
};
export const STYLE_LIST = [punch, focus, glitch, neon, type, cut];
