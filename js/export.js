// ─── export.js — video recording (MediaRecorder), PNG frame, SRT out ─────────
import { download } from './util.js';
import { toSRT } from './lyrics.js';

export function pickMime() {
  const list = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const m of list) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

export async function recordVideo({ engine, transport, fps = 60, onProgress, onState }) {
  if (!window.MediaRecorder) throw new Error('MediaRecorder not supported in this browser.');
  const mime = pickMime();
  const stream = engine.canvas.captureStream(fps);

  // attach audio (loaded song and/or synth beat) — both route through master
  try {
    transport.ensureCtx();
    const tr = transport.recDest.stream.getAudioTracks();
    if (!tr.length) transport.master.connect(transport.recDest);
    tr.forEach(t => stream.addTrack(t));
  } catch (e) { /* video-only fallback */ }

  const rec = new MediaRecorder(stream, {
    mimeType: mime || undefined,
    videoBitsPerSecond: 24_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise(res => rec.onstop = res);

  transport.seek(0);
  rec.start(250);
  await transport.play();
  onState && onState('recording');

  const total = engine.duration;
  await new Promise(res => {
    const iv = setInterval(() => {
      onProgress && onProgress(Math.min(1, transport.time / total));
      if (!transport.playing || transport.time >= total - 0.06) { clearInterval(iv); res(); }
    }, 100);
  });

  // small tail so the last frame is flushed
  await new Promise(r => setTimeout(r, 350));
  transport.pause();
  rec.stop();
  await done;
  onProgress && onProgress(1);
  return new Blob(chunks, { type: mime || 'video/webm' });
}

export async function savePNG(engine, name = 'frame') {
  const blob = await new Promise(res => engine.canvas.toBlob(res, 'image/png'));
  download(`${name}.png`, blob);
}

export function exportSRT(lines, name = 'lyrics') {
  download(`${name}.srt`, new Blob([toSRT(lines)], { type: 'text/plain' }));
}
