import React from "react";
import { fmtTime } from "./app";
import {
  type EasingName,
  type Layer,
  PROP_KEYS,
  type PropKey,
  type ShapeLayer,
  type TextLayer,
} from "../shared/motion/model";
import { propValueAt } from "../shared/motion/engine";

const num = (v: string, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const range = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

const EASINGS: EasingName[] = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeOutCubic",
  "easeOutBack",
];

const PropertyBlock: React.FC<{
  layer: Layer;
  prop: PropKey;
  playhead: number;
  onPropBase: (id: string, prop: PropKey, value: number) => void;
  onToggleKf: (id: string, prop: PropKey, at: number) => void;
  onDeleteKf: (id: string, prop: PropKey, t: number) => void;
  onClearProp: (id: string, prop: PropKey) => void;
  onSetKf: (id: string, prop: PropKey, t: number, patch: { value?: number; easing?: EasingName; t?: number }) => void;
}> = ({ layer, prop, playhead, onPropBase, onToggleKf, onDeleteKf, onClearProp, onSetKf }) => {
  const kfs = layer.transform.keyframes[prop] ?? [];
  const isKeyed = kfs.length > 0;
  const current = propValueAt(layer, prop, playhead);
  const hasKfHere = kfs.some((k) => k.t === playhead);

  const label = prop;
  const step = prop === "scale" || prop === "opacity" ? 0.01 : 1;
  const fmt = (v: number) => (Math.abs(v) < 100 && v % 1 !== 0 ? v.toFixed(2) : String(Math.round(v * 100) / 100));

  const applyBase = (v: number) => {
    const clamped = prop === "opacity" ? range(v, 0, 1) : v;
    if (isKeyed) {
      // edit through the current keyframe if playhead sits on one
      if (hasKfHere) {
        onSetKf(layer.id, prop, playhead, { value: clamped });
      } else {
        onToggleKf(layer.id, prop, playhead);
        onSetKf(layer.id, prop, playhead, { value: clamped });
      }
    } else {
      onPropBase(layer.id, prop, clamped);
    }
  };

  return (
    <div>
      <div className="prop-head">
        <span className="pname">{label}</span>
        <span className="cur">{fmt(current)}</span>
        <button
          className={`kf-add${hasKfHere ? " on" : ""}`}
          title={hasKfHere ? "Remove keyframe at playhead" : `Add keyframe at ${fmtTime(playhead)}`}
          onClick={() => onToggleKf(layer.id, prop, playhead)}
        >
          {hasKfHere ? "◉ kf" : "◇ kf"}
        </button>
        {isKeyed ? (
          <button className="tinybtn" style={{ border: "none", background: "none" }} title="Clear all keyframes" onClick={() => onClearProp(layer.id, prop)}>
            clear
          </button>
        ) : null}
      </div>
      <div className="field-row">
        <input
          type="number"
          step={step}
          value={isKeyed && !hasKfHere ? "" : current}
          placeholder={isKeyed && !hasKfHere ? `kf ${fmt(current)}` : ""}
          onChange={(e) => {
            if (e.target.value !== "") {
              applyBase(num(e.target.value, current));
            }
          }}
          onBlur={(e) => {
            if (e.target.value === "" && !isKeyed) {
              onPropBase(layer.id, prop, current);
            }
          }}
        />
      </div>
      {kfs.length > 0 ? (
        <div className="kf-list">
          {kfs.map((kf, i) => (
            <div className="kf-row" key={`${kf.t}-${i}`}>
              <span className="kf-idx">@{kf.t}</span>
              <input
                type="number"
                step={step}
                value={kf.value}
                onChange={(e) => onSetKf(layer.id, prop, kf.t, { value: num(e.target.value, kf.value) })}
              />
              <select
                value={kf.easing}
                onChange={(e) => onSetKf(layer.id, prop, kf.t, { easing: e.target.value as EasingName })}
              >
                {EASINGS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button className="kf-del" title="Delete keyframe" onClick={() => onDeleteKf(layer.id, prop, kf.t)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const Inspector: React.FC<{
  layer: Layer | null;
  playhead: number;
  onChangeName: (name: string) => void;
  onTextChange: (patch: Partial<TextLayer>) => void;
  onShapeChange: (patch: Partial<ShapeLayer>) => void;
  onPropBase: (id: string, prop: PropKey, value: number) => void;
  onToggleKf: (id: string, prop: PropKey, at: number) => void;
  onDeleteKf: (id: string, prop: PropKey, t: number) => void;
  onClearProp: (id: string, prop: PropKey) => void;
  onSetKf: (id: string, prop: PropKey, t: number, patch: { value?: number; easing?: EasingName; t?: number }) => void;
  onAddLayer: (kind: "text" | "rect" | "ellipse") => void;
}> = ({
  layer,
  playhead,
  onChangeName,
  onTextChange,
  onShapeChange,
  onPropBase,
  onToggleKf,
  onDeleteKf,
  onClearProp,
  onSetKf,
  onAddLayer,
}) => {
  if (!layer) {
    return (
      <aside className="inspector">
        <h3>Properties <span className="small">no layer selected</span></h3>
        <div className="empty-hint">
          Select a layer in the timeline to edit its text, colors and keyframed
          properties.
          <br /><br />
          <button className="tinybtn" onClick={() => onAddLayer("text")}>＋ Add a text layer</button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      <h3>Layer <span className="small">{layer.type === "text" ? "text" : layer.shapeKind === "ellipse" ? "ellipse" : "rectangle"}</span></h3>
      <div className="insp-body">
        <div className="insp-section">
          <div className="sec-title">General</div>
          <div className="field-row">
            <label>Name</label>
            <input type="text" value={layer.name ?? ""} onChange={(e) => onChangeName(e.target.value)} />
          </div>
          {layer.type === "text" ? (
            <>
              <div className="field-row">
                <label style={{ flex: "0 0 100%" }}>Text</label>
              </div>
              <textarea
                className="insp"
                value={(layer as TextLayer).text}
                onChange={(e) => onTextChange({ text: e.target.value })}
              />
              <div className="field-row">
                <label>Size</label>
                <input type="number" min={4} max={600} value={(layer as TextLayer).fontSize} onChange={(e) => onTextChange({ fontSize: range(num(e.target.value, 40), 4, 600) })} />
              </div>
              <div className="field-row">
                <label>Weight</label>
                <select value={(layer as TextLayer).fontWeight} onChange={(e) => onTextChange({ fontWeight: Number(e.target.value) as TextLayer["fontWeight"] })}>
                  {[100, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <label>Align</label>
                <select value={(layer as TextLayer).align} onChange={(e) => onTextChange({ align: e.target.value as TextLayer["align"] })}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div className="field-row">
                <label>Spacing</label>
                <input type="number" step={0.1} min={-10} max={100} value={(layer as TextLayer).letterSpacing} onChange={(e) => onTextChange({ letterSpacing: num(e.target.value, 0) })} />
              </div>
              <div className="field-row">
                <label style={{ flex: "0 0 66px" }}>Color</label>
                <input type="color" className="insp-color" value={(layer as TextLayer).color} onChange={(e) => onTextChange({ color: e.target.value })} />
              </div>
            </>
          ) : (
            <>
              <div className="field-row">
                <label style={{ flex: "0 0 66px" }}>Fill</label>
                <input type="color" className="insp-color" value={(layer as ShapeLayer).fill} onChange={(e) => onShapeChange({ fill: e.target.value })} />
              </div>
              <div className="field-row">
                <label>W</label>
                <input type="number" value={(layer as ShapeLayer).width} onChange={(e) => onShapeChange({ width: Math.round(range(num(e.target.value, 100), 1, 4000)) })} />
              </div>
              <div className="field-row">
                <label>H</label>
                <input type="number" value={(layer as ShapeLayer).height} onChange={(e) => onShapeChange({ height: Math.round(range(num(e.target.value, 100), 1, 4000)) })} />
              </div>
              {(layer as ShapeLayer).shapeKind === "rect" ? (
                <div className="field-row">
                  <label>Radius</label>
                  <input type="number" min={0} value={(layer as ShapeLayer).radius} onChange={(e) => onShapeChange({ radius: range(num(e.target.value, 0), 0, 2000) })} />
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="insp-section">
          <div className="sec-title">Animate <span className="small">playhead @ {playhead}</span></div>
          {PROP_KEYS.map((prop) => (
            <PropertyBlock
              key={prop}
              layer={layer}
              prop={prop}
              playhead={playhead}
              onPropBase={onPropBase}
              onToggleKf={onToggleKf}
              onDeleteKf={onDeleteKf}
              onClearProp={onClearProp}
              onSetKf={onSetKf}
            />
          ))}
        </div>
      </div>
    </aside>
  );
};

export default Inspector;
