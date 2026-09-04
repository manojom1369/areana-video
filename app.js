/* YESHA / Kinetic lyric studio — dependency-free canvas compositor. */
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
const sourceVideo = document.getElementById('sourceVideo');
const sourceAudio = document.getElementById('sourceAudio');
const duration = 22.4;
const W = canvas.width;
const H = canvas.height;

const phrases = [
  { start: 0.0, end: 2.35, text: 'yesha yesha', kind: 'lead' },
  { start: 2.35, end: 5.55, text: 'Yeshanagula kattameedha', kind: 'lead' },
  { start: 5.55, end: 7.95, text: 'yeshina uyyala', kind: 'response' },
  { start: 7.95, end: 10.45, text: 'Manamvugudhame baala', kind: 'refrain' },
  { start: 10.45, end: 13.65, text: 'Yeshanagula kattameedha yeshina uyyala', kind: 'lead' },
  { start: 13.65, end: 16.15, text: 'Manamvugudhame baala', kind: 'refrain' },
  { start: 16.15, end: 18.55, text: 'Yeshanagula kattameedha yeshanagula', kind: 'response' },
  { start: 18.55, end: 20.35, text: 'Yeshanagula kattameedha', kind: 'lead' },
  { start: 20.35, end: 22.4, text: 'Yeshanagula kattameedha', kind: 'refrain' }
];

const style = {
  font: 'editorial',
  fontFamily: 'Playfair Display',
  color: 'saffron',
  colorHex: '#e2ad55',
  motion: 'rise',
  playing: false,
  loop: true,
  muted: false,
  current: 0,
  customFont: null
};
let animationStart = 0;
let animationOrigin = 0;
let raf = 0;
let lastFrameTime = 0;
let toastTimer = 0;
let exportJob = null;
let audioContext = null;
let audioDestination = null;
let audioNode = null;
let sourceUrl = null;
let audioUrl = null;

const $ = (id) => document.getElementById(id);
const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const easeOut = (n) => 1 - Math.pow(1 - clamp(n), 3);
const easeInOut = (n) => n < .5 ? 2 * n * n : 1 - Math.pow(-2 * n + 2, 2) / 2;
const pad = (n) => String(Math.floor(n)).padStart(2, '0');
const timecode = (seconds) => `${pad(seconds / 60)}:${pad(seconds % 60)}`;

function activePhrase(time) {
  return phrases.findIndex((phrase) => time >= phrase.start && time < phrase.end);
}

function getPhraseProgress(phrase, time) {
  return clamp((time - phrase.start) / (phrase.end - phrase.start));
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function syncInterface() {
  const percent = style.current / duration;
  $('currentTime').textContent = timecode(style.current);
  $('durationTime').textContent = timecode(duration);
  $('scrubber').value = style.current;
  $('scrubber').style.setProperty('--scrub', percent);
  document.querySelector('.scrubber-wrap').style.setProperty('--scrub', percent);
  const active = activePhrase(style.current);
  document.querySelectorAll('.mini-line').forEach((item, index) => item.classList.toggle('active', index === active));
  document.querySelectorAll('.beat-block').forEach((item, index) => item.classList.toggle('is-current', index === active));
}

function setCurrentTime(value) {
  style.current = clamp(Number(value), 0, duration);
  syncSourceMedia();
  syncInterface();
}

function syncSourceMedia() {
  if (sourceVideo.readyState >= 1 && Number.isFinite(sourceVideo.duration)) {
    const next = Math.min(style.current, Math.max(0, sourceVideo.duration - .02));
    if (Math.abs(sourceVideo.currentTime - next) > .08) sourceVideo.currentTime = next;
  }
  if (sourceAudio.readyState >= 1 && Number.isFinite(sourceAudio.duration) && !sourceAudio.paused) {
    const next = Math.min(style.current, Math.max(0, sourceAudio.duration - .02));
    if (Math.abs(sourceAudio.currentTime - next) > .12) sourceAudio.currentTime = next;
  }
}

function setPlaying(next) {
  style.playing = next;
  $('playBtn').classList.toggle('playing', next);
  $('renderState').textContent = next ? 'Playing preview' : 'Live render';
  if (next) {
    animationOrigin = style.current;
    animationStart = performance.now();
    if (sourceVideo.src && sourceVideo.readyState >= 2) sourceVideo.play().catch(() => {});
    if (sourceAudio.src && !style.muted) sourceAudio.play().catch(() => {});
  } else {
    sourceVideo.pause();
    sourceAudio.pause();
  }
}

function togglePlay() {
  if (!style.playing && style.current >= duration - .02) setCurrentTime(0);
  setPlaying(!style.playing);
}

function fitCover(image, iw, ih, x, y, width, height) {
  const imageRatio = iw / ih;
  const boxRatio = width / height;
  let dw, dh;
  if (imageRatio > boxRatio) { dh = height; dw = height * imageRatio; }
  else { dw = width; dh = width / imageRatio; }
  ctx.drawImage(image, x + (width - dw) / 2, y + (height - dh) / 2, dw, dh);
}

function drawStudioPlate(time) {
  const t = time * .55;
  ctx.fillStyle = '#111514';
  ctx.fillRect(0, 0, W, H);
  const left = ctx.createRadialGradient(95 + Math.sin(t) * 28, 250 + Math.cos(t * .7) * 30, 0, 95, 250, 480);
  left.addColorStop(0, 'rgba(194, 119, 45, .42)');
  left.addColorStop(.42, 'rgba(90, 65, 31, .18)');
  left.addColorStop(1, 'rgba(13, 19, 18, 0)');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(450 + Math.sin(t * .5) * 20, 115, 0, 450, 115, 340);
  sun.addColorStop(0, 'rgba(236, 191, 105, .27)');
  sun.addColorStop(.35, 'rgba(186, 117, 50, .12)');
  sun.addColorStop(1, 'rgba(186, 117, 50, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(315, 355);
  ctx.rotate(-.2 + Math.sin(t * .3) * .02);
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 215 + i * 30, 115 + i * 24, 0, Math.PI * .08, Math.PI * 1.2);
    ctx.strokeStyle = `rgba(229, 169, 82, ${.11 - i * .012})`;
    ctx.lineWidth = i === 0 ? 2 : 1;
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = .15;
  ctx.strokeStyle = '#f4eddc';
  ctx.lineWidth = 1;
  for (let x = -120; x < W + 150; x += 67) {
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(t + x) * 8, 0);
    ctx.lineTo(x + 230 + Math.sin(t + x) * 8, H);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackdrop(time) {
  if (sourceVideo.readyState >= 2 && sourceVideo.videoWidth) {
    ctx.save();
    fitCover(sourceVideo, sourceVideo.videoWidth, sourceVideo.videoHeight, 0, 0, W, H);
    ctx.restore();
    const wash = ctx.createLinearGradient(0, 0, W, H);
    wash.addColorStop(0, 'rgba(10, 15, 14, .4)');
    wash.addColorStop(.55, 'rgba(28, 20, 13, .27)');
    wash.addColorStop(1, 'rgba(6, 8, 8, .68)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);
  } else {
    drawStudioPlate(time);
  }
  // A barely-there film texture keeps type from feeling pasted on.
  ctx.save();
  ctx.globalAlpha = .055;
  for (let i = 0; i < 230; i++) {
    const x = (i * 83 + Math.floor(time * 7) * 17) % W;
    const y = (i * 47 + 19) % H;
    ctx.fillStyle = i % 3 === 0 ? '#f4eddc' : '#000000';
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function fontFor(size, weight = 600) {
  if (style.font === 'modern') return `${weight} ${size}px Manrope, Arial, sans-serif`;
  if (style.font === 'mono') return `500 ${Math.max(15, size * .62)}px "DM Mono", "Courier New", monospace`;
  const family = style.customFont ? `'${style.customFont}'` : '"Playfair Display", Georgia, serif';
  return `${weight} ${size}px ${family}`;
}

function wrapWords(text, maxWidth, font) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const proposed = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(proposed).width > maxWidth) { lines.push(line); line = word; }
    else line = proposed;
  });
  if (line) lines.push(line);
  return lines;
}

function drawPhrase(phrase, index, time) {
  const progress = getPhraseProgress(phrase, time);
  const isActive = progress >= 0 && progress < 1;
  const words = phrase.text.split(' ');
  let size = style.font === 'mono' ? 41 : style.font === 'modern' ? 38 : 49;
  if (phrase.text.length > 34) size -= style.font === 'editorial' ? 10 : 7;
  if (phrase.text.length > 45) size -= 4;
  let font = fontFor(size, 600);
  let lines = wrapWords(phrase.text, 440, font);
  if (lines.length > 2) { size -= 4; font = fontFor(size, 600); lines = wrapWords(phrase.text, 440, font); }
  const lineHeight = size * (style.font === 'editorial' ? 1.12 : 1.2);
  const totalHeight = lines.length * lineHeight;
  const isPast = time >= phrase.end;
  if (!isActive && !isPast) return;

  const baseY = 480 - totalHeight / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font;
  const opacity = isActive ? 1 : .12;
  const progressForTransform = isActive ? progress : 1;
  const entry = easeOut(clamp(progressForTransform / .34));
  const activeColor = style.colorHex;
  let fill = activeColor;
  if (phrase.kind === 'response') fill = style.color === 'saffron' ? '#f4eddc' : activeColor;
  if (phrase.kind === 'refrain' && style.color === 'saffron') fill = '#e7b769';
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = fill;
  ctx.shadowColor = style.color === 'pearl' ? 'rgba(226,173,85,.15)' : 'rgba(0,0,0,.42)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  lines.forEach((line, lineIndex) => {
    const wordsInLine = line.split(' ');
    const lineWidth = ctx.measureText(line).width;
    let cursorX = -lineWidth / 2;
    const y = baseY + lineIndex * lineHeight + lineHeight / 2;
    wordsInLine.forEach((word, wordIndex) => {
      const gap = ctx.measureText(' ').width;
      const wordWidth = ctx.measureText(word).width;
      const globalWord = lineIndex * 5 + wordIndex;
      const reveal = isActive ? easeOut(clamp((progress - globalWord * .045) / .38)) : 1;
      let x = cursorX + wordWidth / 2;
      let yOffset = 0;
      let scale = .92 + .08 * reveal;
      if (style.motion === 'rise') yOffset = (1 - reveal) * 48;
      if (style.motion === 'drift') { x += (1 - reveal) * (globalWord % 2 ? 38 : -38); yOffset = Math.sin((globalWord + 1) * 2.4) * (1 - reveal) * 16; }
      if (style.motion === 'stamp') { scale = .76 + .24 * reveal; yOffset = (1 - reveal) * 13; }
      ctx.save();
      ctx.globalAlpha = opacity * reveal;
      ctx.translate(x, y + yOffset);
      ctx.scale(scale, scale);
      ctx.fillText(word, 0, 0);
      ctx.restore();
      cursorX += wordWidth + gap;
    });
  });
  ctx.restore();

  if (isActive) {
    ctx.save();
    ctx.globalAlpha = .75 * (1 - progress * .5);
    ctx.strokeStyle = style.colorHex;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(66, 604);
    ctx.lineTo(66 + 86 * easeInOut(clamp(progress * 1.8)), 604);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFrame(time) {
  drawBackdrop(time);
  const active = activePhrase(time);
  const heroIndex = active === -1 ? phrases.length - 1 : active;
  // Editorial frame markers.
  ctx.save();
  ctx.fillStyle = 'rgba(244,237,220,.52)';
  ctx.font = '500 10px "DM Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('A SONG OF LIGHT / 01', 46, 58);
  ctx.fillStyle = style.colorHex;
  ctx.fillRect(46, 75, 27 + (active + 1) * 4, 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(244,237,220,.38)';
  ctx.fillText(timecode(time), W - 46, 58);
  ctx.restore();

  // Previous/next phrases become a soft rhythm field around the hero phrase.
  if (heroIndex > 0) {
    const previous = phrases[heroIndex - 1];
    ctx.save();
    ctx.globalAlpha = .16;
    ctx.fillStyle = style.colorHex;
    ctx.font = fontFor(15, 500);
    ctx.textAlign = 'center';
    ctx.fillText(previous.text, W / 2, 266);
    ctx.restore();
  }
  phrases.forEach((phrase, index) => {
    if (index === heroIndex || index === heroIndex - 1) drawPhrase(phrase, index, time);
  });

  ctx.save();
  ctx.globalAlpha = .7;
  ctx.strokeStyle = style.colorHex;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(46, 832);
  ctx.lineTo(W - 46, 832);
  ctx.stroke();
  ctx.fillStyle = 'rgba(244,237,220,.52)';
  ctx.font = '500 9px "DM Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Y E S H A', 46, 854);
  ctx.textAlign = 'right';
  ctx.fillText('TELUGU FOLK / KINETIC TYPE', W - 46, 854);
  ctx.restore();
}

function render(now = performance.now()) {
  if (style.playing && !exportJob) {
    style.current = animationOrigin + (now - animationStart) / 1000;
    if (style.current >= duration) {
      if (style.loop) { animationOrigin = 0; animationStart = now; style.current = 0; }
      else { style.current = duration; setPlaying(false); }
    }
    syncSourceMedia();
    syncInterface();
  }
  if (exportJob) {
    style.current = clamp((now - exportJob.startedAt) / 1000, 0, duration);
    syncSourceMedia();
    const pct = Math.round(style.current / duration * 100);
    $('renderProgress').style.width = `${pct}%`;
    $('renderState').textContent = `Rendering ${pct}%`;
    if (style.current >= duration && !exportJob.finishing) finishExport();
  }
  drawFrame(style.current);
  lastFrameTime = now;
  raf = requestAnimationFrame(render);
}

function buildLyricsMini() {
  $('lyricsMini').innerHTML = phrases.map((phrase) => `<div class="mini-line">${phrase.text}</div>`).join('');
}

function buildBeatTrack() {
  $('beatTrack').innerHTML = phrases.map((phrase) => {
    const width = ((phrase.end - phrase.start) / duration) * 100;
    return `<div class="beat-block ${phrase.kind}" style="width:${width}%" title="${phrase.text}">${phrase.text}</div>`;
  }).join('');
}

function setupControls() {
  $('playBtn').addEventListener('click', togglePlay);
  $('scrubber').addEventListener('input', (event) => {
    setPlaying(false);
    setCurrentTime(event.target.value);
  });
  $('loopBtn').addEventListener('click', () => {
    style.loop = !style.loop;
    $('loopBtn').classList.toggle('active', style.loop);
    showToast(style.loop ? 'Loop is on' : 'Loop is off');
  });
  $('muteBtn').addEventListener('click', () => {
    style.muted = !style.muted;
    sourceAudio.muted = style.muted;
    $('muteBtn').classList.toggle('active', style.muted);
    showToast(style.muted ? 'Audio muted' : 'Audio on');
  });
  document.querySelectorAll('.mode').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    $('canvasFrame').classList.toggle('safe-visible', button.dataset.mode === 'safe');
  }));
  document.querySelectorAll('[data-font]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-font]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    style.font = button.dataset.font;
    style.customFont = null;
    style.fontFamily = button.dataset.font === 'modern' ? 'Manrope' : button.dataset.font === 'mono' ? 'DM Mono' : 'Playfair Display';
    $('fontValue').textContent = button.textContent;
    $('fontPreview').className = `font-preview ${button.dataset.font === 'editorial' ? '' : button.dataset.font}`;
  }));
  document.querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-color]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    style.color = button.dataset.color;
    style.colorHex = { saffron: '#e2ad55', pearl: '#f4eddc', coral: '#d47e68', mint: '#8db8a3' }[style.color];
    $('colorValue').textContent = button.getAttribute('aria-label').replace(/\s+(gold|white)$/i, '');
    document.querySelector('.color-chip').style.background = style.colorHex;
  }));
  document.querySelectorAll('[data-motion]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-motion]').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    style.motion = button.dataset.motion;
    $('motionValue').textContent = button.querySelector('span:not(.motion-symbol)').textContent;
  }));
  $('videoInput').addEventListener('change', loadVideo);
  $('audioInput').addEventListener('change', loadAudio);
  $('fontInput').addEventListener('change', loadFont);
  $('resetBtn').addEventListener('click', resetProject);
  $('shareBtn').addEventListener('click', shareSetup);
  $('exportBtn').addEventListener('click', openExportModal);
  $('closeModal').addEventListener('click', closeExportModal);
  $('cancelExport').addEventListener('click', closeExportModal);
  $('startExport').addEventListener('click', startExport);
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); showToast('Setup saved in this browser'); }
    if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) { event.preventDefault(); togglePlay(); }
    if (event.key === 'Escape') closeExportModal();
  });
}

function loadVideo(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file);
  sourceVideo.src = sourceUrl;
  sourceVideo.load();
  sourceVideo.addEventListener('loadedmetadata', () => { setCurrentTime(0); }, { once: true });
  $('videoName').textContent = file.name;
  $('videoState').innerHTML = '<i></i><span>Hero video loaded · ready</span>';
  showToast('Hero video loaded. Press play to preview the composite.');
}

function loadAudio(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(file);
  sourceAudio.src = audioUrl;
  sourceAudio.muted = style.muted;
  sourceAudio.load();
  $('audioName').textContent = file.name;
  $('audioState').innerHTML = '<i></i><span>Audio loaded · sync ready</span>';
  showToast('Soundtrack loaded. Audio will be embedded in the WebM export.');
}

async function loadFont(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const family = `AttachedFont${Date.now()}`;
    const face = new FontFace(family, `url(${URL.createObjectURL(file)})`);
    await face.load();
    document.fonts.add(face);
    style.customFont = family;
    style.font = 'editorial';
    document.querySelectorAll('[data-font]').forEach((item) => item.classList.toggle('active', item.dataset.font === 'editorial'));
    $('fontValue').textContent = 'Attached';
    $('fontPreview').textContent = 'Yeshanagula';
    $('fontPreview').className = 'font-preview';
    showToast('Attached font applied to the lyric layer.');
  } catch (error) {
    showToast('That font could not be loaded in this browser.');
  }
}

function resetProject() {
  setPlaying(false);
  setCurrentTime(0);
  style.font = 'editorial'; style.customFont = null; style.color = 'saffron'; style.colorHex = '#e2ad55'; style.motion = 'rise';
  document.querySelectorAll('.segment').forEach((item, i) => item.classList.toggle('active', i === 0));
  document.querySelectorAll('.swatch').forEach((item, i) => item.classList.toggle('active', i === 0));
  document.querySelectorAll('.motion-option').forEach((item, i) => item.classList.toggle('active', i === 0));
  $('fontValue').textContent = 'Editorial'; $('colorValue').textContent = 'Saffron'; $('motionValue').textContent = 'Rise';
  $('fontPreview').className = 'font-preview';
  showToast('Preview reset to the warm editorial treatment.');
}

async function shareSetup() {
  const setup = 'YESHA — 9:16 kinetic lyric film / Editorial + Saffron + Rise / 96 BPM';
  try { await navigator.clipboard.writeText(setup); showToast('Setup copied to clipboard'); }
  catch { showToast('Setup: Editorial · Saffron · Rise · 9:16'); }
}

function openExportModal() {
  $('exportModal').hidden = false;
  $('renderProgress').style.width = '0%';
  $('exportMessage').textContent = sourceVideo.src
    ? 'Your source video is loaded. Render the 9:16 canvas composite as a browser-compatible WebM.'
    : 'The studio plate will render as a polished typography proof. Add your source video and song in the left rail for the final picture lock.';
}
function closeExportModal() { if (!exportJob) $('exportModal').hidden = true; }

function getExportStream() {
  if (!canvas.captureStream || !window.MediaRecorder) throw new Error('This browser does not support canvas recording.');
  const stream = canvas.captureStream(30);
  if (sourceAudio.src) {
    audioContext = audioContext || new AudioContext();
    audioDestination = audioDestination || audioContext.createMediaStreamDestination();
    if (!audioNode) { audioNode = audioContext.createMediaElementSource(sourceAudio); audioNode.connect(audioDestination); }
    audioDestination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }
  return stream;
}

function finishExport() {
  if (!exportJob || exportJob.finishing) return;
  exportJob.finishing = true;
  clearTimeout(exportJob.timeout);
  exportJob.recorder.stop();
}

function startExport() {
  let stream;
  try { stream = getExportStream(); }
  catch (error) { showToast(error.message); return; }
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('stop', () => {
    if (!exportJob) return;
    sourceVideo.pause(); sourceAudio.pause();
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'yesha_kinetic_lyric_film.webm'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    style.current = 0;
    $('renderProgress').style.width = '100%';
    $('renderState').textContent = 'Live render';
    showToast('WebM exported — ready to drop into your edit.');
    exportJob = null;
    $('exportModal').hidden = true;
    syncInterface();
  });
  setPlaying(false);
  sourceVideo.pause(); sourceAudio.pause();
  style.current = 0;
  if (audioContext) audioContext.resume().catch(() => {});
  if (sourceAudio.src) { sourceAudio.currentTime = 0; sourceAudio.muted = style.muted; }
  exportJob = { recorder, startedAt: performance.now(), timeout: setTimeout(() => finishExport(), (duration + 2) * 1000) };
  $('renderState').textContent = 'Rendering 0%';
  recorder.start(100);
  if (sourceVideo.src) sourceVideo.play().catch(() => {});
  if (sourceAudio.src && !style.muted) sourceAudio.play().catch(() => {});
  showToast('Rendering 22.4 seconds at 30 fps…');
}

buildLyricsMini();
buildBeatTrack();
setupControls();
syncInterface();
render();
