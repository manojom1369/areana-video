import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionProjectView } from "../shared/motion/MotionProjectView";
import {
  type EasingName,
  type Layer,
  type MotionProject,
  PROP_KEYS,
  type PropKey,
  type ShapeLayer,
  type TextLayer,
  projectSchema,
} from "../shared/motion/model";
import {
  makeDemoProject,
  makeShapeLayer,
  makeTextLayer,
  propValueAt,
} from "../shared/motion/engine";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";

type Preset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

const PRESETS: Preset[] = [
  { id: "MotionLandscape", label: "16:9 · 1920×1080", width: 1920, height: 1080 },
  { id: "MotionPortrait", label: "9:16 · 1080×1920", width: 1080, height: 1920 },
];

const MAX_SECONDS = 10;
const FPS = 30;

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Player component + zod schema so <Player> inputProps are fully typed. */
const projectPropsSchema = z.object({ project: projectSchema });

const MotionComp: React.FC<{ project: MotionProject }> = ({ project }) => (
  <MotionProjectView project={project} />
);

export const fmtTime = (frame: number): string => {
  const f = Math.max(0, Math.floor(frame));
  const s = Math.floor(f / FPS);
  const fr = f % FPS;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(fr).padStart(2, "0")}`;
};

type ExportState =
  | { status: "idle" }
  | { status: "running"; jobId: string; progress: number; error?: string }
  | { status: "done"; url: string; jobId: string }
  | { status: "error"; error: string };

export const EditorApp: React.FC = () => {
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [project, setProject] = useState<MotionProject>(() =>
    makeDemoProject(PRESETS[0].width, PRESETS[0].height, MAX_SECONDS * FPS),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });

  const playerRef = useRef<PlayerRef>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);
  const pollTimer = useRef<number | null>(null);

  const duration = project.durationInFrames;

  // ------------------------------------------------------------- mutations
  const mutateProject = useCallback(
    (fn: (p: MotionProject) => MotionProject) => {
      setProject((p) => {
        const next = fn(p);
        return next === p ? p : next;
      });
      setDirty(true);
    },
    [],
  );

  const updateLayer = useCallback(
    (id: string, fn: (l: Layer) => Layer) => {
      mutateProject((p) => ({
        ...p,
        layers: p.layers.map((l) => (l.id === id ? fn(l) : l)),
      }));
    },
    [mutateProject],
  );

  const updateTransformProp = useCallback(
    (id: string, prop: PropKey, value: number) => {
      updateLayer(id, (l) => ({
        ...l,
        transform: { ...l.transform, [prop]: round2(value) },
      }));
    },
    [updateLayer],
  );

  const sortKfs = (
    layer: Layer,
    prop: PropKey,
    kfs: NonNullable<Layer["transform"]["keyframes"][PropKey]>,
  ): Layer => ({
    ...layer,
    transform: {
      ...layer.transform,
      keyframes: {
        ...layer.transform.keyframes,
        [prop]: [...kfs].sort((a, b) => a.t - b.t),
      },
    },
  });

  const toggleKeyframe = useCallback(
    (id: string, prop: PropKey, at: number) => {
      const frame = Math.round(at);
      updateLayer(id, (l) => {
        const kfs = l.transform.keyframes[prop] ?? [];
        const existing = kfs.find((k) => k.t === frame);
        if (existing) {
          const rest = kfs.filter((k) => k.t !== frame);
          return rest.length === 0
            ? {
                ...l,
                transform: {
                  ...l.transform,
                  keyframes: { ...l.transform.keyframes, [prop]: undefined },
                },
              }
            : sortKfs(l, prop, rest);
        }
        const value = round2(propValueAt(l, prop, frame));
        return sortKfs(l, prop, [...kfs, { t: frame, value, easing: "linear" }]);
      });
    },
    [updateLayer, sortKfs],
  );

  const deleteKeyframe = useCallback(
    (id: string, prop: PropKey, t: number) => {
      updateLayer(id, (l) => {
        const rest = (l.transform.keyframes[prop] ?? []).filter((k) => k.t !== t);
        if (rest.length === 0) {
          return {
            ...l,
            transform: {
              ...l.transform,
              keyframes: { ...l.transform.keyframes, [prop]: undefined },
            },
          };
        }
        return sortKfs(l, prop, rest);
      });
    },
    [updateLayer, sortKfs],
  );

  const clearPropKeyframes = useCallback(
    (id: string, prop: PropKey) => {
      updateLayer(id, (l) => ({
        ...l,
        transform: {
          ...l.transform,
          keyframes: { ...l.transform.keyframes, [prop]: undefined },
        },
      }));
    },
    [updateLayer],
  );

  const moveKeyframe = useCallback(
    (id: string, prop: PropKey, fromT: number, toT: number) => {
      const target = Math.round(toT);
      if (target === fromT) {
        return;
      }
      updateLayer(id, (l) => {
        const kfs = l.transform.keyframes[prop] ?? [];
        if (!kfs.some((k) => k.t === fromT)) {
          return l;
        }
        let rest = kfs
          .filter((k) => k.t !== fromT)
          .map((k) => ({ ...k, t: k.t === fromT ? undefined : k.t })) as typeof kfs;
        const moved = kfs.find((k) => k.t === fromT)!;
        rest = rest.filter((k) => k.t !== target);
        return sortKfs(l, prop, [...rest, { ...moved, t: target }]);
      });
    },
    [updateLayer, sortKfs],
  );

  const setKeyframe = useCallback(
    (id: string, prop: PropKey, t: number, patch: { value?: number; easing?: EasingName; t?: number }) => {
      updateLayer(id, (l) => {
        const kfs = l.transform.keyframes[prop] ?? [];
        const next = kfs.map((k) =>
          k.t === t
            ? {
                ...k,
                ...(patch.value !== undefined ? { value: round2(patch.value) } : {}),
                ...(patch.easing !== undefined ? { easing: patch.easing } : {}),
                ...(patch.t !== undefined ? { t: Math.round(patch.t) } : {}),
              }
            : k,
        );
        return sortKfs(l, prop, next);
      });
    },
    [updateLayer, sortKfs],
  );

  const addLayer = useCallback(
    (kind: "text" | "rect" | "ellipse") => {
      const cx = project.width / 2;
      const cy = project.height / 2;
      const idx = project.layers.length + 1;
      let layer: Layer;
      if (kind === "text") {
        layer = makeTextLayer({
          text: "Your text",
          x: cx,
          y: cy,
          fontSize: Math.round(project.height * 0.06),
          fontWeight: 800,
          align: "center",
          color: "#FFFFFF",
          name: `Text ${idx}`,
        });
      } else {
        layer = makeShapeLayer({
          shapeKind: kind,
          width: Math.round(project.width * 0.3),
          height: Math.round(project.height * 0.08),
          x: cx,
          y: cy,
          fill: kind === "rect" ? "#8B5CF6" : "#F472B6",
          radius: kind === "rect" ? 16 : 0,
          name: kind === "rect" ? `Rectangle ${idx}` : `Ellipse ${idx}`,
        });
      }
      mutateProject((p) => ({ ...p, layers: [...p.layers, layer] }));
      setSelectedId(layer.id);
    },
    [project, mutateProject],
  );

  const deleteLayer = useCallback(
    (id: string) => {
      mutateProject((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [mutateProject],
  );

  const duplicateLayer = useCallback(
    (id: string) => {
      mutateProject((p) => {
        const index = p.layers.findIndex((l) => l.id === id);
        if (index === -1) {
          return p;
        }
        const src = p.layers[index];
        const copy = JSON.parse(JSON.stringify(src)) as Layer;
        copy.id = `${src.id}-c${Date.now().toString(36)}`;
        copy.name = `${src.name ?? "Layer"} copy`;
        const layers = [...p.layers];
        layers.splice(index + 1, 0, copy);
        return { ...p, layers };
      });
    },
    [mutateProject],
  );

  const moveLayer = useCallback(
    (id: string, dir: -1 | 1) => {
      mutateProject((p) => {
        const index = p.layers.findIndex((l) => l.id === id);
        const target = index + dir;
        if (index === -1 || target < 0 || target >= p.layers.length) {
          return p;
        }
        const layers = [...p.layers];
        const [item] = layers.splice(index, 1);
        layers.splice(target, 0, item);
        return { ...p, layers };
      });
    },
    [mutateProject],
  );

  const setProjectDuration = useCallback(
    (seconds: number) => {
      const frames = Math.min(MAX_SECONDS, Math.max(1, seconds)) * FPS;
      mutateProject((p) => ({ ...p, durationInFrames: frames }));
    },
    [mutateProject],
  );

  const switchPreset = useCallback(
    (presetId: string) => {
      const next = PRESETS.find((p) => p.id === presetId);
      if (!next) {
        return;
      }
      if (dirty && !window.confirm("Switch canvas? Your current project will be replaced by the demo.")) {
        return;
      }
      setPreset(next);
      setProject(makeDemoProject(next.width, next.height, MAX_SECONDS * FPS));
      setDirty(false);
      setSelectedId(null);
      setPlayhead(0);
      setExportState({ status: "idle" });
    },
    [dirty],
  );

  // ------------------------------------------------------------- playback
  const seekTo = useCallback(
    (frame: number) => {
      const f = Math.min(duration - 1, Math.max(0, Math.round(frame)));
      playerRef.current?.seekTo(f);
      setPlayhead(f);
    },
    [duration],
  );

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) {
      return;
    }
    if (p.isPlaying()) {
      p.pause();
    } else {
      p.play();
    }
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    const onFrame = ({ detail }: { detail: { frame: number } }) => {
      // Move the playhead marker imperatively to avoid re-rendering per frame.
      const f = detail.frame;
      if (markerRef.current) {
        markerRef.current.style.left = `${f * PX_PER_FRAME}px`;
      }
      if (timecodeRef.current) {
        timecodeRef.current.textContent = fmtTime(f);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
    };
  }, [project.width, project.height, duration]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekTo(playhead - (e.shiftKey ? 10 : 1));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekTo(playhead + (e.shiftKey ? 10 : 1));
      } else if (e.code === "Delete" && selectedId) {
        e.preventDefault();
        deleteLayer(selectedId);
      } else if (e.code === "Home") {
        e.preventDefault();
        seekTo(0);
      } else if (e.code === "End") {
        e.preventDefault();
        seekTo(duration - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playhead, duration, selectedId, togglePlay, seekTo, deleteLayer]);

  // ------------------------------------------------------------- rendering
  const startRender = useCallback(async () => {
    if (exportState.status === "running") {
      return;
    }
    setExportState({ status: "running", jobId: "", progress: 0 });
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: preset.id, props: { project } }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const jobId: string = body.jobId;
      setExportState({ status: "running", jobId, progress: 0 });
      pollTimer.current = window.setInterval(async () => {
        try {
          const r = await fetch(`/api/jobs/${jobId}`);
          const j = (await r.json()).job;
          if (j.status === "in-progress") {
            setExportState({ status: "running", jobId, progress: j.progress });
          } else if (j.status === "completed") {
            if (pollTimer.current !== null) {
              clearInterval(pollTimer.current);
              pollTimer.current = null;
            }
            setExportState({ status: "done", url: j.downloadUrl, jobId });
          } else if (j.status === "failed") {
            if (pollTimer.current !== null) {
              clearInterval(pollTimer.current);
              pollTimer.current = null;
            }
            setExportState({ status: "error", error: j.error ?? "Render failed" });
          }
        } catch (err) {
          if (pollTimer.current !== null) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
          }
          setExportState({ status: "error", error: (err as Error).message });
        }
      }, 1200);
    } catch (err) {
      setExportState({ status: "error", error: (err as Error).message });
    }
  }, [exportState.status, preset.id, project]);

  useEffect(() => {
    return () => {
      if (pollTimer.current !== null) {
        clearInterval(pollTimer.current);
      }
    };
  }, []);

  // ------------------------------------------------------------- stage fit
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      const availW = Math.max(100, r.width - 24);
      const availH = Math.max(100, r.height - 24);
      const a = project.width / project.height;
      let w = availW;
      let h = w / a;
      if (h > availH) {
        h = availH;
        w = h * a;
      }
      setStageSize({ w: Math.round(w), h: Math.round(h) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  const selectedLayer = useMemo(
    () => project.layers.find((l) => l.id === selectedId) ?? null,
    [project.layers, selectedId],
  );

  const keyframesCount = useMemo(
    () =>
      project.layers.reduce(
        (sum, l) =>
          sum +
          PROP_KEYS.reduce((s, p) => s + (l.transform.keyframes[p]?.length ?? 0), 0),
        0,
      ),
    [project.layers],
  );

  return (
    <div className="main">
      <div className="toolbar">
        <span className="brand">
          <em>Areana</em> Motion Editor
        </span>
        <a className="link" href="/">← Render lab</a>
        <span className="sep" />
        <select
          value={preset.id}
          onChange={(e) => switchPreset(e.target.value)}
          title="Canvas preset"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={duration / FPS}
          onChange={(e) => setProjectDuration(Number(e.target.value))}
          title="Duration"
        >
          {Array.from({ length: MAX_SECONDS }, (_, i) => i + 1).map((s) => (
            <option key={s} value={s}>
              {s}s
            </option>
          ))}
        </select>
        <span className="sep" />
        <button className="iconbtn play" onClick={togglePlay}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <span className="timecode">
          <span ref={timecodeRef}>{fmtTime(playhead)}</span>
          <span style={{ color: "var(--muted)" }}> / {fmtTime(duration - 1)}</span>
        </span>
        <button className="btn-render" onClick={startRender} disabled={exportState.status === "running"}>
          {exportState.status === "running" ? "Rendering…" : "⬇ Render MP4"}
        </button>
      </div>

      <div className="stage-row">
        <div className="stage" ref={stageRef}>
          {stageSize.w > 0 ? (
            <div
              className="stage-box"
              style={{ width: stageSize.w, height: stageSize.h }}
            >
              <Player
                ref={playerRef}
                component={MotionComp}
                schema={projectPropsSchema}
                inputProps={{ project }}
                durationInFrames={duration}
                fps={FPS}
                compositionWidth={project.width}
                compositionHeight={project.height}
                style={{ width: "100%", height: "100%" }}
                loop
                controls={false}
                acknowledgeRemotionLicense
              />
            </div>
          ) : null}
          {exportState.status === "done" ? null : null}
        </div>
        <Inspector
          layer={selectedLayer}
          playhead={playhead}
          onChangeName={(name) => selectedId && updateLayer(selectedId, (l) => ({ ...l, name }))}
          onTextChange={(patch: Partial<TextLayer>) =>
            selectedLayer?.type === "text" &&
            selectedId &&
            updateLayer(selectedId, (l) => (l.type === "text" ? { ...l, ...patch } : l))
          }
          onShapeChange={(patch: Partial<ShapeLayer>) =>
            selectedLayer?.type === "shape" &&
            selectedId &&
            updateLayer(selectedId, (l) => (l.type === "shape" ? { ...l, ...patch } : l))
          }
          onPropBase={updateTransformProp}
          onToggleKf={toggleKeyframe}
          onDeleteKf={deleteKeyframe}
          onClearProp={clearPropKeyframes}
          onSetKf={setKeyframe}
          onAddLayer={addLayer}
        />
      </div>

      <div className="export-strip">
        {exportState.status === "idle" ? (
          <span>
            {project.layers.length} layers · {keyframesCount} keyframes — export renders
            “{preset.label}” through the render API.
          </span>
        ) : null}
        {exportState.status === "running" ? (
          <>
            <span className="spinner" />
            <span>Rendering {project.durationInFrames / FPS}s MP4…</span>
            <span className="bar">
              <div style={{ width: `${exportState.progress}%` }} />
            </span>
            <span>{exportState.progress}%</span>
          </>
        ) : null}
        {exportState.status === "done" ? (
          <>
            <span className="ok">✓ Rendered</span>
            <video src={exportState.url} controls autoPlay muted loop playsInline />
            <a className="dl" href={exportState.url} download={`${preset.id}-${Date.now()}.mp4`}>
              Download MP4
            </a>
          </>
        ) : null}
        {exportState.status === "error" ? (
          <span className="err">✗ {exportState.error}</span>
        ) : null}
      </div>

      <Timeline
        project={project}
        selectedId={selectedId}
        playhead={playhead}
        markerRef={markerRef}
        onSeek={seekTo}
        onSelect={setSelectedId}
        onToggleVisible={(id) =>
          updateLayer(id, (l) => ({ ...l, visible: !l.visible }))
        }
        onMoveLayer={moveLayer}
        onDeleteLayer={deleteLayer}
        onDuplicateLayer={duplicateLayer}
        onAddLayer={addLayer}
        onKfDrag={moveKeyframe}
        onKfDblClick={deleteKeyframe}
      />
    </div>
  );
};

export const PX_PER_FRAME = 12;
