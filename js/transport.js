// ─── transport.js — unified play clock, audio file, FFT reactive, beat synth ─
import { clamp } from './util.js';

export class Transport {
  constructor() {
    this.audioEl = null;          // HTMLAudioElement when a song is loaded
    this.ctx = null;              // AudioContext (lazy)
    this.master = null;           // master gain → speakers + recDest
    this.recDest = null;          // MediaStreamDestination for export
    this.analyser = null;
    this.freqData = null;
    this.elSource = null;

    this.playing = false;
    this._clockStart = 0;         // performance.now when internal clock started
    this._clockOffset = 0;        // time at pause
    this._env = 0;                // smoothed bass envelope (audio-reactive)

    this.synthOn = true;          // demo beat
    this._nextBeat = 0;
    this._noiseBuf = null;
    this.bpm = 100; this.offset = 0.6;
    this.onEnd = null;
  }

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.55;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.recDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.ctx.destination);
      this.master.connect(this.recDest);
      this.master.connect(this.analyser);

      // noise buffer for hats/snare
      const len = this.ctx.sampleRate * 0.5;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  get hasAudio() { return !!this.audioEl; }

  async loadFile(file) {
    this.ensureCtx();
    if (this.audioEl) { this.audioEl.pause(); URL.revokeObjectURL(this.audioEl.src); }
    const el = new Audio();
    el.src = URL.createObjectURL(file);
    el.preload = 'auto';
    await new Promise((res, rej) => { el.oncanplaythrough = res; el.onerror = rej; el.load(); });
    if (this.elSource) { try { this.elSource.disconnect(); } catch (e) {} }
    this.elSource = this.ctx.createMediaElementSource(el);
    this.elSource.connect(this.master);
    this.audioEl = el;
    el.onended = () => { if (this.playing) this.pause(); this.onEnd && this.onEnd(); };
    return el;
  }

  unloadAudio() {
    if (this.audioEl) { this.audioEl.pause(); URL.revokeObjectURL(this.audioEl.src); }
    this.audioEl = null;
  }

  get duration() {
    if (this.audioEl && isFinite(this.audioEl.duration)) return this.audioEl.duration;
    return this._virtualDur ?? 30;
  }
  set virtualDuration(v) { this._virtualDur = v; }

  get time() {
    if (this.audioEl) return this.audioEl.currentTime;
    if (!this.playing) return this._clockOffset;
    return this._clockOffset + (performance.now() - this._clockStart) / 1000;
  }

  async play() {
    if (this.playing) return;
    this.ensureCtx();
    this.playing = true;
    if (this.audioEl) await this.audioEl.play().catch(() => {});
    else {
      this._clockStart = performance.now();
      this._nextBeat = this.time + 0.05;
      this._synthTimer = setInterval(() => this._scheduleSynth(), 60);
      this._scheduleSynth();
    }
    if (this.audioEl) { this._nextBeat = this.time + 0.05; this._synthTimer = setInterval(() => this._scheduleSynth(), 60); this._scheduleSynth(); }
  }

  pause() {
    this.playing = false;
    if (this.audioEl) this.audioEl.pause();
    else this._clockOffset = this.time;
    clearInterval(this._synthTimer);
  }

  seek(t) {
    t = clamp(t, 0, Math.max(0, this.duration - 0.01));
    if (this.audioEl) this.audioEl.currentTime = t;
    else {
      this._clockOffset = t;
      this._clockStart = performance.now();
    }
    this._nextBeat = t + 0.05;
    this._env = 0;
  }

  // bass envelope 0..1 for audio-reactive mode
  envelope() {
    if (!this.analyser || !this.hasAudio) return 0;
    this.analyser.getByteFrequencyData(this.freqData);
    let sum = 0, n = Math.floor(this.freqData.length * 0.12); // low bins
    for (let i = 0; i < n; i++) sum += this.freqData[i];
    const avg = sum / n / 255;
    const kick = clamp((avg - 0.45) * 2.2, 0, 1); // gate noise floor
    this._env = Math.max(kick, this._env * 0.88);  // fast attack, slow decay
    return this._env;
  }

  // ── synthesized demo beat (works with or without a loaded song) ────────────
  _scheduleSynth() {
    if (!this.playing || !this.synthOn) return;
    const beatDur = 60 / this.bpm;
    const now = this.ctx.currentTime;
    // map transport time → audio context time
    const tAhead = this.time + 0.18;
    while (this._nextBeat < tAhead) {
      const when = now + (this._nextBeat - this.time);
      const idx = Math.round((this._nextBeat - this.offset) / beatDur);
      if (when >= now - 0.02 && this._nextBeat >= this.offset - 0.001 && idx >= 0) {
        const inBar = ((idx % 4) + 4) % 4;
        if (inBar === 0 || inBar === 2) this._kick(when, inBar === 0 ? 1 : 0.8);
        if (inBar === 1 || inBar === 3) this._snare(when, 0.5);
        this._hat(when + beatDur / 2, 0.22);
        if (inBar === 0 && idx % 8 === 0) this._hat(when + beatDur * 0.75, 0.16);
      }
      this._nextBeat += beatDur / 2; // schedule at 8th-note resolution
    }
  }

  _kick(when, vol = 1) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
    g.gain.setValueAtTime(0.9 * vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.26);
    o.connect(g).connect(this.master);
    o.start(when); o.stop(when + 0.3);
  }
  _snare(when, vol = 0.5) {
    const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
    s.connect(f).connect(g).connect(this.master);
    s.start(when, 0, 0.2);
  }
  _hat(when, vol = 0.2) {
    const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 8200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    s.connect(f).connect(g).connect(this.master);
    s.start(when, 0, 0.08);
  }
}
