import React, { useMemo } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_FAMILY } from "./fonts";

/**
 * Small deterministic motion helpers used by every template.
 * Everything is a pure function of `frame`, so renders are deterministic.
 */

type SpringOpts = {
  frame: number;
  fps: number;
  delay?: number;
  config?: Parameters<typeof spring>[0]["config"];
};

/** 0..1 ease-out spring starting after `delay` frames. Clamped at 1 afterwards. */
export const useEntrance = (delay = 0, config?: SpringOpts["config"]): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: config ?? { damping: 200 } });
};

/** 0..1 smooth loop used for "breathing" glows. `period` is in frames. */
export const breathe = (frame: number, period = 90): number =>
  0.5 + 0.5 * Math.sin((frame / period) * Math.PI * 2);

/**
 * Reveals multi-line text: every line wipes up out of an overflow-hidden mask,
 * one after another. `headline` may contain "\n".
 */
export const LinesReveal: React.FC<{
  readonly text: string;
  readonly style?: React.CSSProperties;
  readonly startFrom?: number;
  readonly lineGapFrames?: number;
  readonly fontSize?: number;
  readonly weight?: number;
  readonly letterSpacing?: number;
  readonly color?: string;
  readonly align?: React.CSSProperties["textAlign"];
  readonly lineHeight?: number;
}> = ({
  text,
  style,
  startFrom = 0,
  lineGapFrames = 8,
  fontSize = 64,
  weight = 900,
  letterSpacing = -1.5,
  color = "#fff",
  align = "left",
  lineHeight = 1.06,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = text.split("\n");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        ...style,
      }}
    >
      {lines.map((line, i) => {
        const progress = spring({
          frame: frame - startFrom - i * lineGapFrames,
          fps,
          config: { damping: 200 },
        });
        return (
          <div
            key={i}
            style={{ overflow: "hidden", paddingBottom: 2, marginBottom: -2 }}
          >
            <div
              style={{
                transform: `translateY(${(1 - progress) * 60}%)`,
                opacity: progress,
                fontSize,
                fontWeight: weight,
                letterSpacing,
                lineHeight,
                color,
                fontFamily: FONT_FAMILY,
                textAlign: align,
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Fades + slides a block in from below. */
export const RiseIn: React.FC<{
  readonly children: React.ReactNode;
  readonly delay?: number;
  readonly distance?: number;
  readonly style?: React.CSSProperties;
}> = ({ children, delay = 0, distance = 60, style }) => {
  const p = useEntrance(delay);
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * distance}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Global fade-in (start) / fade-out (end) for a whole composition. */
export const useClipFade = (): number => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const dur = durationInFrames;
  return useMemo(
    () =>
      interpolate(
        frame,
        [0, 12, dur - 24, dur - 8],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      ),
    [frame, dur],
  );
};

/** Animated radial gradient backdrop shared by the templates. */
export const GlowBackdrop: React.FC<{
  readonly accent: string;
  readonly accent2: string;
}> = ({ accent, accent2 }) => {
  const frame = useCurrentFrame();
  const p = useEntrance(4);

  const drift1 = breathe(frame, 130);
  const drift2 = breathe(frame + 55, 170);
  const drift3 = breathe(frame + 100, 200);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "linear-gradient(160deg, #0a0914 0%, #0d0b1a 45%, #07060e 100%)",
        opacity: p,
      }}
    >
      {/* accent glow top-right */}
      <div
        style={{
          position: "absolute",
          width: "1100px",
          height: "1100px",
          right: "-180px",
          top: "-320px",
          borderRadius: "50%",
          background: accent,
          filter: "blur(160px)",
          opacity: 0.5,
          transform: `translate(${drift1 * 60}px, ${drift1 * 40}px) scale(${1 + drift1 * 0.08})`,
        }}
      />
      {/* accent2 glow bottom-left */}
      <div
        style={{
          position: "absolute",
          width: "1000px",
          height: "1000px",
          left: "-340px",
          bottom: "-420px",
          borderRadius: "50%",
          background: accent2,
          filter: "blur(180px)",
          opacity: 0.32,
          transform: `translate(${drift2 * -50}px, ${drift2 * -30}px) scale(${1 + drift2 * 0.1})`,
        }}
      />
      {/* soft center lift */}
      <div
        style={{
          position: "absolute",
          width: "1400px",
          height: "700px",
          left: "50%",
          top: "38%",
          transform: `translate(-50%, -50%) scale(${1 + drift3 * 0.06})`,
          background:
            "radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, transparent 65%)",
        }}
      />
    </div>
  );
};

/** Utility: deterministic sine-based bob for floating elements. */
export const bobY = (frame: number, phase: number, amplitude = 14): number =>
  Math.sin((frame + phase) * 0.045) * amplitude;
