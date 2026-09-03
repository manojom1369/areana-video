import {
  type EasingName,
  type Keyframe,
  type Layer,
  type MotionProject,
  PROP_KEYS,
  type PropKey,
  type ShapeLayer,
  type TextLayer,
} from "./model";
import type { CSSProperties } from "react";

/**
 * Pure evaluation engine for motion projects.
 *
 * Given a project and a frame number it computes, for every layer, the exact
 * style (transforms + opacity) that the composition should show on that frame.
 * The engine is deterministic and framework-agnostic:
 *   - Remotion composition applies the styles to DOM elements per frame
 *   - the editor uses the same functions to preview values at the playhead
 */

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const EASING_FNS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export const easingNames = (): EasingName[] =>
  Object.keys(EASING_FNS) as EasingName[];

export const applyEasing = (name: EasingName, t: number): number =>
  EASING_FNS[name](clamp(t, 0, 1));

export const evalKeyframes = (
  keyframes: Keyframe[] | undefined,
  frame: number,
): number | null => {
  if (!keyframes || keyframes.length === 0) {
    return null;
  }
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  if (frame <= sorted[0].t) {
    return sorted[0].value;
  }
  const last = sorted[sorted.length - 1];
  if (frame >= last.t) {
    return last.value;
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const kf = sorted[i];
    const next = sorted[i + 1];
    if (frame >= kf.t && frame < next.t) {
      const t = next.t === kf.t ? 0 : (frame - kf.t) / (next.t - kf.t);
      return lerp(kf.value, next.value, applyEasing(kf.easing, t));
    }
  }
  return last.value;
};

export const evalProp = (
  base: number,
  keyframes: Keyframe[] | undefined,
  frame: number,
): number => {
  const fromKf = evalKeyframes(keyframes, frame);
  return fromKf === null ? base : fromKf;
};

/** All properties a layer needs at a given frame. */
export const evalTransform = (
  layer: Layer,
  frame: number,
): { x: number; y: number; scale: number; rotation: number; opacity: number } => {
  const t = layer.transform;
  return {
    x: evalProp(t.x, t.keyframes.x, frame),
    y: evalProp(t.y, t.keyframes.y, frame),
    scale: evalProp(t.scale, t.keyframes.scale, frame),
    rotation: evalProp(t.rotation, t.keyframes.rotation, frame),
    opacity: evalProp(t.opacity, t.keyframes.opacity, frame),
  };
};

/** CSS transform string for an absolute-positioned, centered element. */
export const styleTransform = (e: {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}): string =>
  `translate(${e.x}px, ${e.y}px) translate(-50%, -50%) scale(${e.scale}) rotate(${e.rotation}deg)`;

export const layerHasKeyframes = (layer: Layer): PropKey[] =>
  PROP_KEYS.filter((p) => (layer.transform.keyframes[p]?.length ?? 0) > 0);

/** Value of a property at `frame`, honoring keyframes (used by the editor UI). */
export const propValueAt = (layer: Layer, prop: PropKey, frame: number): number =>
  evalProp(layer.transform[prop], layer.transform.keyframes[prop], frame);

/** Background CSS for the composition canvas. */
export const backgroundStyle = (
  bg: MotionProject["background"],
): CSSProperties => {
  if (bg.type === "solid") {
    return { backgroundColor: bg.color };
  }
  return {
    backgroundImage: `linear-gradient(${bg.angle}deg, ${bg.from} 0%, ${bg.to} 100%)`,
  };
};

// Helpers to keep the demo builder / editor tidy ---------------------------

const makeId = (): string =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const makeLayerBase = (name: string) => ({
  id: makeId(),
  name,
  visible: true,
  transform: {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    keyframes: {},
  },
});

export const makeTextLayer = (partial: {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color?: string;
  fontWeight?: number;
  align?: TextLayer["align"];
  name?: string;
  letterSpacing?: number;
  lineHeight?: number;
  maxWidth?: number;
}): TextLayer => {
  const base = makeLayerBase(partial.name ?? `Text "${partial.text.slice(0, 12)}…"`);
  return {
    ...base,
    type: "text",
    text: partial.text,
    fontSize: partial.fontSize,
    fontWeight: partial.fontWeight ?? 900,
    color: partial.color ?? "#ffffff",
    align: partial.align ?? "center",
    maxWidth: partial.maxWidth,
    letterSpacing: partial.letterSpacing ?? 0,
    lineHeight: partial.lineHeight ?? 1.15,
    transform: { ...base.transform, x: partial.x, y: partial.y },
  };
};

export const makeShapeLayer = (partial: {
  shapeKind: ShapeLayer["shapeKind"];
  width: number;
  height: number;
  x: number;
  y: number;
  fill: string;
  radius?: number;
  name?: string;
}): ShapeLayer => {
  const base = makeLayerBase(partial.name ?? "Shape");
  return {
    ...base,
    type: "shape",
    shapeKind: partial.shapeKind,
    width: partial.width,
    height: partial.height,
    radius: partial.radius ?? 0,
    fill: partial.fill,
    transform: { ...base.transform, x: partial.x, y: partial.y },
  };
};

/**
 * Rich demo project (used as default in the editor and for the compositions).
 * Layout is computed from width/height so it works for 16:9 and 9:16.
 */
export const makeDemoProject = (
  width: number,
  height: number,
  durationInFrames: number,
): MotionProject => {
  const short = width < height; // portrait
  const cx = width / 2;
  const h = height;
  const w = width;
  const yTextBlock = short ? h * 0.24 : h * 0.32;
  const textSize = short ? h * 0.05 : h * 0.082;
  const subSize = textSize * 0.32;
  const accent = "#8B5CF6";
  const accent2 = "#F472B6";

  const layers: Layer[] = [];

  // ambient glow ellipse (bottom-right area)
  const glow = makeShapeLayer({
    shapeKind: "ellipse",
    width: short ? w * 1.1 : w * 0.42,
    height: short ? w * 1.1 : w * 0.42,
    x: short ? cx : w * 0.78,
    y: short ? h * 0.78 : h * 0.72,
    fill: "#6D28D9",
    name: "Glow",
  });
  glow.transform.opacity = 0.32;
  glow.transform.keyframes.opacity = [
    { t: 0, value: 0.22, easing: "easeInOutQuad" },
    { t: 150, value: 0.4, easing: "easeInOutQuad" },
    { t: 299, value: 0.24, easing: "easeInOutQuad" },
  ];
  layers.push(glow);

  // pink accent dot drifting (demonstrates x/y keyframes)
  const dot = makeShapeLayer({
    shapeKind: "ellipse",
    width: short ? w * 0.05 : w * 0.035,
    height: short ? w * 0.05 : w * 0.035,
    x: short ? cx : w * 0.8,
    y: short ? h * 0.68 : h * 0.6,
    fill: accent2,
    name: "Accent dot",
  });
  dot.transform.keyframes.x = [
    { t: 0, value: dot.transform.x, easing: "easeInOutQuad" },
    { t: 150, value: dot.transform.x + (short ? w * 0.3 : w * 0.12), easing: "easeInOutQuad" },
    { t: 299, value: dot.transform.x, easing: "easeInOutQuad" },
  ];
  dot.transform.keyframes.y = [
    { t: 0, value: dot.transform.y, easing: "easeInOutQuad" },
    { t: 120, value: dot.transform.y - (short ? h * 0.12 : h * 0.09), easing: "easeInOutQuad" },
    { t: 299, value: dot.transform.y, easing: "easeInOutQuad" },
  ];
  layers.push(dot);

  // headline (multi-line, slides up with back-ease + fades in)
  const headlineLines = ["Sound that", "moves you."];
  const headline = makeTextLayer({
    text: headlineLines.join("\n"),
    x: cx,
    y: yTextBlock,
    fontSize: textSize,
    color: "#ffffff",
    fontWeight: 900,
    align: "center",
    lineHeight: 1.06,
    letterSpacing: -1,
    name: "Headline",
  });
  headline.transform.y = yTextBlock + h * 0.06;
  headline.transform.keyframes.y = [
    { t: 0, value: yTextBlock + h * 0.2, easing: "easeOutBack" },
    { t: 46, value: yTextBlock, easing: "linear" },
  ];
  headline.transform.keyframes.opacity = [
    { t: 0, value: 0, easing: "easeOutCubic" },
    { t: 34, value: 1, easing: "linear" },
  ];
  layers.push(headline);

  // gradient underline bar sweeping in
  const bar = makeShapeLayer({
    shapeKind: "rect",
    width: short ? w * 0.56 : w * 0.34,
    height: short ? h * 0.006 : h * 0.008,
    x: cx,
    y: short ? yTextBlock + textSize * 1.5 + h * 0.03 : yTextBlock + textSize * 0.95 + h * 0.02,
    fill: accent,
    radius: 4,
    name: "Accent bar",
  });
  // gradient bar: emulate with two bars stacked? single fill accent is fine
  bar.transform.keyframes.scale = [
    { t: 40, value: 0, easing: "easeOutCubic" },
    { t: 78, value: 1, easing: "linear" },
  ];
  bar.transform.keyframes.opacity = [
    { t: 40, value: 0, easing: "easeOutCubic" },
    { t: 70, value: 1, easing: "linear" },
  ];
  layers.push(bar);

  // subtitle fades in later
  const subtitle = makeTextLayer({
    text: "Adaptive noise cancelling, 42-hour battery and studio-tuned audio.",
    x: cx,
    y: short
      ? yTextBlock + textSize * 2.1 + h * 0.05
      : yTextBlock + textSize * 1.35 + h * 0.03,
    fontSize: subSize,
    color: "#C9C5DA",
    fontWeight: 500,
    align: "center",
    maxWidth: short ? w * 0.78 : w * 0.55,
    lineHeight: 1.5,
    name: "Subtitle",
  });
  subtitle.transform.opacity = 0;
  subtitle.transform.keyframes.opacity = [
    { t: 84, value: 0, easing: "easeOutCubic" },
    { t: 118, value: 1, easing: "linear" },
  ];
  layers.push(subtitle);

  // pill badge top-left (kicker)
  const kickerSize = short ? textSize * 0.3 : textSize * 0.24;
  const pill = makeShapeLayer({
    shapeKind: "rect",
    width: short ? w * 0.36 : w * 0.2,
    height: short ? h * 0.045 : h * 0.038,
    x: cx,
    y: short ? yTextBlock - textSize * 1.1 - h * 0.02 : yTextBlock - textSize * 0.95,
    fill: "#241F3D",
    radius: 999,
    name: "Kicker pill",
  });
  pill.transform.opacity = 0;
  pill.transform.keyframes.opacity = [
    { t: 6, value: 0, easing: "easeOutCubic" },
    { t: 26, value: 1, easing: "linear" },
  ];
  pill.transform.keyframes.scale = [
    { t: 6, value: 0.85, easing: "easeOutBack" },
    { t: 32, value: 1, easing: "linear" },
  ];
  layers.push(pill);

  const kickerText = makeTextLayer({
    text: "NEW ARRIVAL",
    x: cx,
    y: short ? yTextBlock - textSize * 1.1 - h * 0.02 : yTextBlock - textSize * 0.95,
    fontSize: kickerSize,
    color: "#B9A7F5",
    fontWeight: 700,
    align: "center",
    letterSpacing: 4,
    name: "Kicker text",
  });
  kickerText.transform.opacity = 0;
  kickerText.transform.keyframes.opacity = [
    { t: 10, value: 0, easing: "easeOutCubic" },
    { t: 30, value: 1, easing: "linear" },
  ];
  layers.push(kickerText);

  // floating spec chips (portrait: under text; landscape: right side)
  const chipYs = short
    ? [h * 0.56, h * 0.565 + h * 0.075]
    : [h * 0.5, h * 0.5 + h * 0.13];
  const chipX = short ? cx : w * 0.8;
  const chipSpecs: Array<{ label: string; delay: number }> = [
    { label: "42h battery", delay: 130 },
    { label: "Noise cancelling", delay: 152 },
  ];
  chipSpecs.forEach((spec, i) => {
    const chipW = short ? w * 0.42 : w * 0.155;
    const chipH = short ? h * 0.055 : h * 0.052;
    const chip = makeShapeLayer({
      shapeKind: "rect",
      width: chipW,
      height: chipH,
      x: chipX,
      y: chipYs[i],
      fill: "#16122A",
      radius: chipH / 2,
      name: `Chip ${i + 1}`,
    });
    chip.transform.keyframes.y = [
      { t: spec.delay, value: chipYs[i] + h * 0.03, easing: "easeOutCubic" },
      { t: spec.delay + 22, value: chipYs[i], easing: "linear" },
    ];
    chip.transform.keyframes.opacity = [
      { t: spec.delay, value: 0, easing: "easeOutCubic" },
      { t: spec.delay + 18, value: 1, easing: "linear" },
    ];
    layers.push(chip);

    const chipLabel = makeTextLayer({
      text: spec.label,
      x: chipX,
      y: chipYs[i],
      fontSize: short ? chipH * 0.36 : chipH * 0.4,
      color: "#EDE9FB",
      fontWeight: 600,
      align: "center",
      name: `Chip ${i + 1} label`,
    });
    chipLabel.transform.keyframes.opacity = [
      { t: spec.delay + 8, value: 0, easing: "easeOutCubic" },
      { t: spec.delay + 26, value: 1, easing: "linear" },
    ];
    layers.push(chipLabel);
  });

  return {
    version: 1,
    width,
    height,
    fps: 30,
    durationInFrames,
    background: { type: "linear", from: "#141027", to: "#07060F", angle: 160 },
    fontFamily: "Montserrat",
    layers,
  };
};
