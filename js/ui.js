// ─── ui.js — panel wiring, tap timing, shortcuts, files, export flow ─────────
import { $, $$, fmtTime, clamp } from './util.js';
import { STYLE_LIST, STYLES } from './styles.js';
import { PALETTES } from './demo.js';
import { parseLyricText, parseLRC, parseSRT, autoTime, finalizeLines } from './lyrics.js';
import { recordVideo, savePNG, exportSRT } from './export.js';

export function initUI(app) {
  const { S, transport, engine } = app;
  const seek = $('#seek');

  // ── tabs ───────────────────────────────────────────────────────────────────
  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
    $$('.tabpane').forEach(p => p.classList.toggle('active', p.id === `tab-${tab.dataset.tab}`));
  }));

  // ── style cards ────────────────────────────────────────────────────────────
  const grid = $('#styleGrid');
  STYLE_LIST.forEach((st, i) => {
    const card = document.createElement('div');
    card.className = 'style-card' + (st.id === S.style ? ' active' : '');
    card.dataset.style = st.id;
    card.innerHTML = `<span class="num">0${i + 1}</span><b>${st.name}</b><span>${st.blurb}</span>`;
    card.addEventListener('click', () => app.selectStyle(st.id));
    grid.appendChild(card);
  });

  // ── palette chips ──────────────────────────────────────────────────────────
  const chips = $('#paletteChips');
  PALETTES.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'pal-chip';
    chip.innerHTML = `<i style="background:linear-gradient(135deg,${p.bg2},${p.accent})"></i>${p.name}`;
    chip.addEventListener('click', () => {
      Object.assign(S.palette, { bg1: p.bg1, bg2: p.bg2, accent: p.accent, text: p.text });
      syncColors(); app.touch();
    });
    chips.appendChild(chip);
  });

  function syncColors() {
    $('#cBg1').value = S.palette.bg1; $('#cBg2').value = S.palette.bg2;
    $('#cAccent').value = S.palette.accent; $('#cText').value = S.palette.text;
  }
  syncColors();
  const bindColor = (id, key) => $(id).addEventListener('input', e => { S.palette[key] = e.target.value; app.touch(); });
  bindColor('#cBg1', 'bg1'); bindColor('#cBg2', 'bg2'); bindColor('#cAccent', 'accent'); bindColor('#cText', 'text');

  // ── style controls ─────────────────────────────────────────────────────────
  $('#fontSelect').value = S.font;
  $('#fontSelect').addEventListener('change', e => { S.font = e.target.value; engine._layoutKey = ''; app.touch(); });
  $('#uppercase').checked = S.uppercase;
  $('#uppercase').addEventListener('change', e => { S.uppercase = e.target.checked; engine._layoutKey = ''; app.touch(); });
  $('#bgSelect').value = S.bg;
  $('#bgSelect').addEventListener('change', e => { S.bg = e.target.value; app.touch(); });
  $('#aspect').value = S.aspect;
  $('#aspect').addEventListener('change', e => { S.aspect = e.target.value; engine.resize(S.aspect); app.touch(); meta(); });

  // ── motion sliders ─────────────────────────────────────────────────────────
  const slider = (id, key, fmt = v => v, out) => {
    const el = $(id), o = out ? $(out) : null;
    el.value = S.motion[key];
    if (o) o.textContent = fmt(S.motion[key]);
    el.addEventListener('input', () => {
      S.motion[key] = parseFloat(el.value);
      if (o) o.textContent = fmt(S.motion[key]);
      app.touch();
    });
  };
  slider('#mZoom', 'zoom', v => (+v).toFixed(3), '#mZoomV');
  slider('#mShake', 'shake', v => (+v).toFixed(2), '#mShakeV');
  slider('#mEnter', 'enterMs', v => Math.round(v), '#mEnterV');
  slider('#mExit', 'exitMs', v => Math.round(v), '#mExitV');
  const check = (id, key, cb) => { const el = $(id); el.checked = S[key] ?? S.motion[key]; el.addEventListener('change', () => { (key in S.motion) ? S.motion[key] = el.checked : S[key] = el.checked; cb && cb(); app.touch(); }); };
  check('#mGrain', 'grain'); check('#mVignette', 'vignette'); check('#mProgress', 'progress');
  $('#reactive').checked = S.motion.reactive;
  $('#reactive').addEventListener('change', e => { S.motion.reactive = e.target.checked; app.touch(); });
  $('#demoBeat').checked = S.motion.demoBeat;
  $('#demoBeat').addEventListener('change', e => { transport.synthOn = e.target.checked; app.touch(); });

  // ── transport fields ───────────────────────────────────────────────────────
  const bpmEl = $('#bpm'); bpmEl.value = S.motion.bpm;
  bpmEl.addEventListener('change', () => {
    S.motion.bpm = clamp(parseFloat(bpmEl.value) || 120, 40, 240);
    bpmEl.value = S.motion.bpm;
    if (S.timingMode === 'auto') app.retime(); else app.touch();
  });
  $('#barsPerLine').value = String(S.motion.barsPerLine);
  $('#barsPerLine').addEventListener('change', e => {
    S.motion.barsPerLine = parseFloat(e.target.value);
    if (S.timingMode === 'auto') app.retime(); else app.touch();
  });
  const offEl = $('#offsetMs'); offEl.value = Math.round(S.motion.offsetSec * 1000);
  offEl.addEventListener('change', () => {
    S.motion.offsetSec = (parseFloat(offEl.value) || 0) / 1000;
    if (S.timingMode === 'auto') app.retime(); else app.touch();
  });

  // tap-BPM
  let taps = [];
  $('#btnTapBpm').addEventListener('click', () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2200) taps = [];
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 3) {
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      const bpm = clamp(Math.round(60000 / iv * 10) / 10, 40, 240);
      S.motion.bpm = bpm; bpmEl.value = bpm;
      if (S.timingMode === 'auto') app.retime(); else app.touch();
    }
  });

  // ── play / seek ────────────────────────────────────────────────────────────
  const playBtn = $('#btnPlay');
  const setPlayIcon = () => { playBtn.textContent = transport.playing ? '⏸' : '▶'; };
  playBtn.addEventListener('click', () => { transport.playing ? (transport.pause(), setPlayIcon()) : (transport.play().then(setPlayIcon), setPlayIcon()); });
  $('#btnStop').addEventListener('click', () => { transport.pause(); transport.seek(0); setPlayIcon(); });
  transport.onEnd = () => { setPlayIcon(); };
  let seeking = false;
  seek.addEventListener('pointerdown', () => seeking = true);
  window.addEventListener('pointerup', () => seeking = false);
  seek.addEventListener('input', () => { transport.seek(parseFloat(seek.value)); });

  // ── lyrics ─────────────────────────────────────────────────────────────────
  const lyricEl = $('#lyricText');
  lyricEl.value = app.lyricText;
  $('#btnApply').addEventListener('click', () => app.applyLyrics(lyricEl.value));
  $('#btnNudgeL').addEventListener('click', () => app.nudge(-0.1));
  $('#btnNudgeR').addEventListener('click', () => app.nudge(0.1));

  // ── files ──────────────────────────────────────────────────────────────────
  $('#audioFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      await transport.loadFile(f);
      S.songName = f.name;
      if (S.motion.demoBeat) { S.motion.demoBeat = false; transport.synthOn = false; $('#demoBeat').checked = false; }
      app.updateSeekMax(); meta(); app.touch();
    } catch (err) { alert('Could not load that audio file.'); }
  });
  $('#subsFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result);
      const lines = /\.srt$/i.test(f.name) ? parseSRT(txt) : parseLRC(txt);
      if (!lines.length) { alert('No timed lines found in that file.'); return; }
      app.setLines(lines, 'import');
      lyricEl.value = lines.map(L => L.words.map(w => (w.emph ? `*${w.text}*` : w.text)).join(' ')).join('\n');
      app.lyricText = lyricEl.value;
      meta();
    };
    reader.readAsText(f);
  });
  $('#btnDemo').addEventListener('click', () => app.loadDemo());

  // ── export ─────────────────────────────────────────────────────────────────
  const recChip = $('#recChip'), recBar = $('#recBar'), recPct = $('#recPct');
  let recording = false;
  $('#btnRecord').addEventListener('click', async () => {
    if (recording) return;
    if (!app.lines.length) { alert('Add some lyrics first.'); return; }
    recording = true;
    recChip.classList.remove('hidden');
    $('#btnRecord').disabled = true;
    try {
      const fps = parseInt($('#fps').value, 10);
      const blob = await recordVideo({
        engine, transport, fps,
        onProgress: p => { recBar.style.width = `${Math.round(p * 100)}%`; recPct.textContent = `${Math.round(p * 100)}%`; },
      });
      const name = (S.title || 'kinetic-lyrics').replace(/[^\w\- ]+/g, '').trim() || 'kinetic-lyrics';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    } catch (err) {
      alert(`Recording failed: ${err.message}`);
    } finally {
      recording = false;
      recChip.classList.add('hidden');
      $('#btnRecord').disabled = false;
      transport.pause(); setPlayIcon();
    }
  });
  $('#btnPNG').addEventListener('click', () => savePNG(engine, (S.title || 'frame').replace(/[^\w\- ]+/g, '')));
  $('#btnSRT').addEventListener('click', () => app.lines.length && exportSRT(app.lines, (S.title || 'lyrics').replace(/[^\w\- ]+/g, '')));

  // ── tap timing mode ────────────────────────────────────────────────────────
  const overlay = $('#tapOverlay');
  let tapActive = false, tapIdx = 0;
  function tapUpdate() {
    const L = app.lines[tapIdx];
    $('#tapCount').textContent = `${Math.min(tapIdx + 1, app.lines.length)} / ${app.lines.length}`;
    $('#tapLine').textContent = L ? L.words.map(w => w.text).join(' ') : '✓ done — press ESC';
  }
  function tapFinish(apply) {
    tapActive = false;
    overlay.classList.add('hidden');
    transport.pause(); setPlayIcon();
    if (apply && app._stamps?.length) {
      const stamps = app._stamps;
      const bar = 60 / S.motion.bpm * 4 * S.motion.barsPerLine;
      const lines = app.lines;
      let last = stamps[stamps.length - 1] ?? S.motion.offsetSec;
      lines.forEach((L, i) => {
        if (stamps[i] != null) L.start = stamps[i];
        else { L.start = last + bar; last = L.start; }
      });
      // dedupe ascending
      for (let i = 1; i < lines.length; i++) if (lines[i].start <= lines[i - 1].start) lines[i].start = lines[i - 1].start + 0.8;
      finalizeLines(lines);
      app.setLines(lines, 'tap');
    }
    app._stamps = null;
  }
  $('#btnTap').addEventListener('click', () => {
    if (tapActive || !app.lines.length) return;
    if (app.lines.some(L => L.start == null)) return;
    tapActive = true; tapIdx = 0; app._stamps = [];
    overlay.classList.remove('hidden');
    transport.seek(0);
    transport.play().then(setPlayIcon); setPlayIcon();
    tapUpdate();
  });

  // ── global keys ────────────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (tapActive) {
      if (e.code === 'Space') {
        e.preventDefault();
        app._stamps[tapIdx] = transport.time;
        tapIdx++; tapUpdate();
        if (tapIdx >= app.lines.length) tapFinish(true);
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        tapIdx = Math.max(0, tapIdx - 1); app._stamps.length = Math.min(app._stamps.length, tapIdx);
        tapUpdate();
      } else if (e.code === 'Escape') {
        tapFinish(true);
      }
      return;
    }
    if (inField) return;
    if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
    else if (e.key === 't' || e.key === 'T') $('#btnTap').click();
    else if (e.key >= '1' && e.key <= '6') app.selectStyle(STYLE_LIST[+e.key - 1].id);
    else if (e.code === 'ArrowLeft') { transport.seek(transport.time - 2); }
    else if (e.code === 'ArrowRight') { transport.seek(transport.time + 2); }
    else if (e.key === '[') app.nudge(-0.1);
    else if (e.key === ']') app.nudge(0.1);
    else if (e.key === 'f' || e.key === 'F') {
      const w = $('#stageWrap');
      document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen?.().then(() => engine._layoutKey = '');
    }
  });

  // ── title ──────────────────────────────────────────────────────────────────
  const titleEl = $('#projectTitle');
  titleEl.value = S.title;
  titleEl.addEventListener('input', () => { S.title = titleEl.value; app.touch(); });

  // ── per-frame UI refresh (called from main loop) ───────────────────────────
  app.uiTick = (t, pulse) => {
    $('#timeLabel').textContent = fmtTime(t);
    $('#durLabel').textContent = fmtTime(app.duration);
    if (!seeking) seek.value = t;
    $('#beatLamp').style.opacity = clamp(0.12 + pulse * 0.88, 0, 1);
    // highlight current line
    const cur = app.lines.indexOf(engine.lineAt(t));
    const items = $$('#linesList .line-item');
    items.forEach((el, i) => el.classList.toggle('now', i === cur));
  };

  function meta() {
    const [w, h] = [engine.W, engine.H];
    const song = S.songName ? ` · ♪ ${S.songName}` : '';
    $('#stageMeta').textContent = `${w}×${h} · ${STYLES[S.style].name.toLowerCase()}${song}`;
  }
  app.meta = meta; meta();

  app.syncPlayIcon = setPlayIcon;
  app.refreshList = () => {
    const list = $('#linesList');
    list.innerHTML = '';
    app.lines.forEach((L, i) => {
      const el = document.createElement('div');
      el.className = 'line-item';
      el.innerHTML = `<span class="t">${fmtTime(L.start)}</span><span class="l">${L.words.map(w => w.text).join(' ')}</span>`;
      el.addEventListener('click', () => { transport.seek(Math.max(0, L.start - 0.4)); });
      list.appendChild(el);
    });
    $('#lineStats').textContent = `${app.lines.length} lines · ${S.timingMode || 'auto'} timing`;
  };
  app.refreshList();
  app.updateSeekMax();
}
