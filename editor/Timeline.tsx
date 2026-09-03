import React, { useState } from "react";
import { PX_PER_FRAME } from "./app";
import {
  type MotionProject,
  PROP_KEYS,
  type PropKey,
} from "../shared/motion/model";

/**
 * Layer list + keyframe track editor with a ruler and a draggable playhead.
 * The app wires the playhead marker through markerRef (imperative DOM updates
 * during playback).
 */

const PROP_CLASS: Record<PropKey, string> = {
  x: "px-x",
  y: "px-y",
  scale: "px-scale",
  rotation: "px-rotation",
  opacity: "px-opacity",
};

type DragState =
  | { type: "kf"; layerId: string; prop: PropKey; t: number; startX: number; startT: number }
  | { type: "playhead"; startX: number; startT: number };

export const Timeline: React.FC<{
  project: MotionProject;
  selectedId: string | null;
  playhead: number;
  markerRef: React.RefObject<HTMLDivElement | null>;
  onSeek: (frame: number) => void;
  onSelect: (id: string | null) => void;
  onToggleVisible: (id: string) => void;
  onMoveLayer: (id: string, dir: -1 | 1) => void;
  onDeleteLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onAddLayer: (kind: "text" | "rect" | "ellipse") => void;
  onKfDrag: (layerId: string, prop: PropKey, fromT: number, toT: number) => void;
  onKfDblClick: (layerId: string, prop: PropKey, t: number) => void;
}> = ({
  project,
  selectedId,
  playhead,
  markerRef,
  onSeek,
  onSelect,
  onToggleVisible,
  onMoveLayer,
  onDeleteLayer,
  onDuplicateLayer,
  onAddLayer,
  onKfDrag,
  onKfDblClick,
}) => {
  const { layers, durationInFrames } = project;
  const totalLayers = layers.length;
  const totalW = durationInFrames * PX_PER_FRAME;
  const dragRef = React.useRef<DragState | null>(null);

  const frameFromEvent = (e: React.MouseEvent | MouseEvent, element: HTMLElement): number => {
    const rect = element.getBoundingClientRect();
    return Math.max(0, Math.min(durationInFrames - 1, Math.round((e.clientX - rect.left) / PX_PER_FRAME)));
  };

  const capturePointer = (e: React.MouseEvent, el: HTMLElement): void => {
    const pointerId = (e.nativeEvent as PointerEvent).pointerId;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // not supported for this event type — drag still works via mouse moves
    }
  };

  const onRulerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    capturePointer(e, el);
    const frame = frameFromEvent(e, el);
    dragRef.current = { type: "playhead", startX: e.clientX, startT: frame };
    onSeek(frame);
  };

  const onRulerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current?.type === "playhead") {
      onSeek(frameFromEvent(e, e.currentTarget));
    }
  };

  const onRulerUp = () => {
    dragRef.current = null;
  };

  const onKfDown = (e: React.MouseEvent, layerId: string, prop: PropKey, t: number) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    capturePointer(e, el);
    dragRef.current = { type: "kf", layerId, prop, t, startX: e.clientX, startT: t };
  };

  const onKfMove = (e: React.MouseEvent, layerId: string, prop: PropKey) => {
    const drag = dragRef.current;
    if (drag?.type === "kf" && drag.layerId === layerId && drag.prop === prop) {
      const strip = (e.currentTarget as HTMLElement).parentElement;
      if (!strip) {
        return;
      }
      onKfDrag(layerId, prop, drag.t, frameFromEvent(e, strip));
    }
  };

  const onKfUp = () => {
    dragRef.current = null;
  };

  const onStripClick = (e: React.MouseEvent<HTMLDivElement>, layerId: string) => {
    if (e.target !== e.currentTarget) {
      return;
    }
    onSelect(layerId);
    onSeek(frameFromEvent(e, e.currentTarget));
  };

  const [hoverKf, setHoverKf] = useState<{ layerId: string; prop: PropKey; t: number; value: number } | null>(null);

  return (
    <div className="timeline-wrap">
      <div className="timeline-head">
        <h2>Timeline</h2>
        <span className="legend">
          <span><span className="sw px-x" />X</span>
          <span><span className="sw px-y" />Y</span>
          <span><span className="sw px-scale" />Scale</span>
          <span><span className="sw px-rotation" />Rotation</span>
          <span><span className="sw px-opacity" />Opacity</span>
        </span>
        <span className="tl-hint">
          space: play/pause · ←/→: step (shift ×10) · del: remove layer · drag keyframes · dbl-click a keyframe to delete it
        </span>
      </div>

      <div className="scroller">
        <div className="tl-inner" style={{ width: Math.max(totalW + 8, 800), minHeight: totalLayers * 26 + 12 }}>
          {/* ruler */}
          <div className="row-head-ruler" style={{ display: "flex" }}>
            <div className="ruler-cell" style={{ height: 34 }} />
            <div className="ruler" style={{ width: totalW, height: 34, position: "relative" }} onMouseDown={onRulerDown} onMouseMove={onRulerMove} onMouseUp={onRulerUp}>
              {Array.from({ length: durationInFrames }, (_, i) => i).filter((i) => i % 5 === 0).map((i) => (
                <React.Fragment key={i}>
                  <div className={i % 30 === 0 ? "tick major" : "tick minor"} style={{ left: i * PX_PER_FRAME }} />
                  {i % 30 === 0 ? (
                    <span className="ruler-label" style={{ left: i * PX_PER_FRAME }}>{Math.round(i / 30)}s</span>
                  ) : null}
                </React.Fragment>
              ))}
              <div className="playhead-cap" style={{ left: playhead * PX_PER_FRAME }} />
            </div>
          </div>

          {/* rows */}
          {layers.map((layer, index) => {
            const isSel = layer.id === selectedId;
            return (
              <div
                key={layer.id}
                className={`row${isSel ? " selected" : ""}`}
                style={{ position: "relative", height: 26 }}
              >
                <div
                  className="row-name"
                  onClick={() => onSelect(isSel ? null : layer.id)}
                >
                  <button
                    className={`eye${layer.visible ? "" : " off"}`}
                    title={layer.visible ? "Hide" : "Show"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisible(layer.id);
                    }}
                  >
                    {layer.visible ? "👁" : "—"}
                  </button>
                  <span className="type">{layer.type === "text" ? "T" : layer.shapeKind === "ellipse" ? "●" : "▭"}</span>
                  <span className="nm">{layer.name ?? layer.id}</span>
                  <span className="row-actions">
                    <button title="Move up" disabled={index === 0} onClick={(e) => { e.stopPropagation(); onMoveLayer(layer.id, -1); }}>↑</button>
                    <button title="Move down" disabled={index === totalLayers - 1} onClick={(e) => { e.stopPropagation(); onMoveLayer(layer.id, 1); }}>↓</button>
                    <button title="Duplicate" onClick={(e) => { e.stopPropagation(); onDuplicateLayer(layer.id); }}>⧉</button>
                    <button title="Delete" onClick={(e) => { e.stopPropagation(); onDeleteLayer(layer.id); }}>✕</button>
                  </span>
                </div>

                <div className="strip" style={{ position: "absolute", left: 190, right: 0, top: 0, bottom: 0 }} onClick={(e) => onStripClick(e, layer.id)}>
                  {/* vertical guide every second */}
                  {Array.from({ length: Math.floor(durationInFrames / 30) + 1 }, (_, i) => i * 30).map((f) => (
                    <div key={f} className="ln" style={{ left: f * PX_PER_FRAME }} />
                  ))}
                  {/* keyframe diamonds */}
                  {PROP_KEYS.map((prop) =>
                    (layer.transform.keyframes[prop] ?? []).map((kf) => {
                      const isHover = hoverKf?.layerId === layer.id && hoverKf?.prop === prop && hoverKf?.t === kf.t;
                      return (
                        <div
                          key={`${prop}-${kf.t}`}
                          className={`kf ${PROP_CLASS[prop]}${isSel ? " sel" : ""}`}
                          style={{ left: kf.t * PX_PER_FRAME, backgroundColor: "var(--kf-c)" }}
                          data-prop={prop}
                          data-t={kf.t}
                          onMouseDown={(e) => onKfDown(e, layer.id, prop, kf.t)}
                          onMouseMove={(e) => onKfMove(e, layer.id, prop)}
                          onMouseUp={onKfUp}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            onKfDblClick(layer.id, prop, kf.t);
                          }}
                          onMouseEnter={() => setHoverKf({ layerId: layer.id, prop, t: kf.t, value: kf.value })}
                          onMouseLeave={() => setHoverKf(null)}
                          title={`${prop} @ ${kf.t}: ${kf.value}${isSel ? " (drag to move, dbl-click to delete)" : ""}`}
                        >
                          <span
                            style={{
                              position: "absolute", top: -2, left: 15, fontSize: 10, color: "#c4b5fd",
                              background: "#0e0c1b", border: "1px solid var(--border)", borderRadius: 4,
                              padding: "0 4px", whiteSpace: "nowrap", pointerEvents: "none", zIndex: 40,
                              display: isHover ? "block" : "none",
                            }}
                          >
                            {prop} {kf.t} = {kf.value}
                          </span>
                        </div>
                      );
                    }),
                  )}
                  {/* mini ruler for kf t */}
                  {isSel ? (
                    <div className="row-name" style={{ left: 0 }} />
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* playhead line spans ruler + layers (rendered above rows via later DOM order inside tl-inner) */}
          <div className="playhead-line" ref={markerRef} style={{ left: playhead * PX_PER_FRAME, top: 34 }} />
        </div>
      </div>

      <div className="add-layer">
        <button onClick={() => onAddLayer("text")}>＋ Text</button>
        <button onClick={() => onAddLayer("rect")}>＋ Rectangle</button>
        <button onClick={() => onAddLayer("ellipse")}>＋ Ellipse</button>
      </div>
    </div>
  );
};

export default Timeline;
