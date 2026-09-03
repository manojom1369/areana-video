import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  backgroundStyle,
  evalTransform,
  styleTransform,
} from "./engine";
import {
  type Layer,
  type MotionProject,
  type ShapeLayer,
  type TextLayer,
} from "./model";

/**
 * Renders a MotionProject at the current Remotion frame.
 * Used by the registered compositions (remotion/Root.tsx) for rendering and
 * by the editor's live preview through @remotion/player.
 */

const textStyle = (layer: TextLayer): React.CSSProperties => ({
  fontFamily: "Montserrat, sans-serif",
  fontSize: layer.fontSize,
  fontWeight: layer.fontWeight,
  color: layer.color,
  textAlign: layer.align,
  letterSpacing: layer.letterSpacing,
  lineHeight: layer.lineHeight,
  whiteSpace: "pre-line",
  width: layer.maxWidth ?? "max-content",
  maxWidth: layer.maxWidth,
  textTransform: "none",
});

const shapeStyle = (layer: ShapeLayer): React.CSSProperties => ({
  width: layer.width,
  height: layer.height,
  borderRadius:
    layer.shapeKind === "ellipse" ? "50%" : layer.radius > 0 ? layer.radius : undefined,
  backgroundColor: layer.fill,
});

const LayerElement: React.FC<{ layer: Layer; frame: number }> = ({ layer, frame }) => {
  const t = evalTransform(layer, frame);
  const base: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: t.opacity,
    transform: styleTransform(t),
    transformOrigin: "center center",
    willChange: "transform, opacity",
  };
  if (!layer.visible || t.opacity <= 0.001) {
    return null;
  }
  if (layer.type === "text") {
    return (
      <div style={{ ...base, pointerEvents: "none" }}>
        <div style={textStyle(layer)}>{layer.text}</div>
      </div>
    );
  }
  return <div style={{ ...base, ...shapeStyle(layer) }} />;
};

export const MotionProjectView: React.FC<{ project: MotionProject }> = ({ project }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ ...backgroundStyle(project.background), overflow: "hidden" }}>
      {project.layers.map((layer) => (
        <LayerElement key={layer.id} layer={layer} frame={frame} />
      ))}
    </AbsoluteFill>
  );
};
