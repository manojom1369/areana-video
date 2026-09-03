import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { zColor } from "@remotion/zod-types";
import React from "react";
import { z } from "zod";
import {
  FONT_FAMILY,
  FONT_WEIGHTS,
} from "../lib/fonts";
import {
  bobY,
  breathe,
  GlowBackdrop,
  LinesReveal,
  RiseIn,
  useClipFade,
  useEntrance,
} from "../lib/motion";

export const AD_FPS = 30;
export const AD_DURATION_IN_FRAMES = 300; // 10 seconds
export const AD_WIDTH = 1920;
export const AD_HEIGHT = 1080;
export const AD_VERTICAL_WIDTH = 1080;
export const AD_VERTICAL_HEIGHT = 1920;

/**
 * Everything the end user (or your API clients) can customize.
 * The same schema drives Remotion Studio's prop editor and the render API.
 */
export const productAdSchema = z.object({
  kicker: z.string().min(1).max(60),
  productName: z.string().min(1).max(48),
  headline: z.string().min(1).max(220),
  subheadline: z.string().min(1).max(320),
  price: z.string().min(1).max(24),
  ctaText: z.string().min(1).max(40),
  accent: zColor(),
  accent2: zColor(),
});

export type ProductAdProps = z.infer<typeof productAdSchema>;

export const productAdDefaultProps: ProductAdProps = {
  kicker: "New arrival",
  productName: "Aurora Buds 2",
  headline: "Sound that\nmoves you.",
  subheadline:
    "Adaptive noise cancelling, 42-hour battery life and studio-tuned audio — now in your pocket.",
  price: "$149",
  ctaText: "Shop the drop",
  accent: "#8B5CF6",
  accent2: "#F472B6",
};

const INITIALS = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (name.trim().slice(0, 2) || "AV").toUpperCase();
};

const kickerChip = (): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 22px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
  fontSize: 20,
  fontWeight: 600,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  fontFamily: FONT_FAMILY,
});

const priceStyle = (color: string): React.CSSProperties => ({
  fontFamily: FONT_FAMILY,
  color,
  fontSize: 64,
  fontWeight: FONT_WEIGHTS.extrabold,
  letterSpacing: -1.5,
  lineHeight: 1,
  whiteSpace: "nowrap",
});

const ctaStyle = (accent: string, accent2: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 16,
  padding: "24px 44px",
  borderRadius: 999,
  background: `linear-gradient(90deg, ${accent} 0%, ${accent2} 100%)`,
  color: "#0b0a14",
  fontSize: 26,
  fontWeight: FONT_WEIGHTS.bold,
  letterSpacing: 0.2,
  fontFamily: FONT_FAMILY,
  whiteSpace: "nowrap",
  boxShadow: `0 18px 60px -12px ${accent}aa`,
});

const subStyle: React.CSSProperties = {
  fontFamily: FONT_FAMILY,
  color: "rgba(255,255,255,0.68)",
  fontSize: 27,
  fontWeight: FONT_WEIGHTS.medium,
  lineHeight: 1.55,
  letterSpacing: 0.1,
};

/** The stylized product "visual": glowing card + monogram + floating chips. */
const ProductVisual: React.FC<{
  readonly productName: string;
  readonly accent: string;
  readonly accent2: string;
  readonly cardWidth: number;
  readonly cardHeight: number;
}> = ({ productName, accent, accent2, cardWidth, cardHeight }) => {
  const frame = useCurrentFrame();
  const cardP = useEntrance(22);
  const chipP = useEntrance(36);
  const ringP = useEntrance(40);
  const bob = bobY(frame, 20, 10);

  return (
    <div
      style={{
        position: "relative",
        width: cardWidth * 1.45,
        height: cardHeight * 1.25,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* rotating dashed ring */}
      <div
        style={{
          position: "absolute",
          width: cardHeight * 1.02,
          height: cardHeight * 1.02,
          borderRadius: "50%",
          border: "1.5px dashed rgba(255,255,255,0.16)",
          opacity: ringP,
          transform: `rotate(${frame * 0.45}deg) scale(${0.9 + ringP * 0.1})`,
        }}
      />
      {/* glow behind the card */}
      <div
        style={{
          position: "absolute",
          width: cardWidth * 1.15,
          height: cardWidth * 1.15,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}66 0%, ${accent2}33 55%, transparent 72%)`,
          filter: "blur(50px)",
          transform: `scale(${0.92 + breathe(frame, 110) * 0.16})`,
        }}
      />
      {/* the card itself */}
      <div
        style={{
          position: "absolute",
          width: cardWidth,
          height: cardHeight,
          borderRadius: 46,
          background: "linear-gradient(155deg, rgba(255,255,255,0.15), rgba(255,255,255,0.045))",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 60px 140px -30px rgba(0,0,0,0.75)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
          transform: `translateY(${(1 - cardP) * 90 + bob}px) scale(${0.82 + cardP * 0.18}) rotate(-7deg)`,
          opacity: cardP,
          padding: 40,
        }}
      >
        <div
          style={{
            fontSize: cardWidth * 0.36,
            lineHeight: 1,
            fontWeight: FONT_WEIGHTS.black,
            letterSpacing: -8,
            fontFamily: FONT_FAMILY,
            backgroundImage: `linear-gradient(135deg, #ffffff 10%, ${accent} 55%, ${accent2} 95%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {INITIALS(productName)}
        </div>
        <div
          style={{
            fontSize: 19,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.78)",
            fontWeight: FONT_WEIGHTS.semibold,
            fontFamily: FONT_FAMILY,
            textAlign: "center",
          }}
        >
          {productName}
        </div>
        <div
          style={{
            width: cardWidth * 0.42,
            height: 5,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${accent}, ${accent2})`,
            opacity: 0.9,
          }}
        />
      </div>

      {/* floating chips */}
      {[
        { label: "Free shipping", left: "0%", top: "10%", phase: 0 },
        { label: "60-day returns", left: "6%", bottom: "12%", phase: 70 },
      ].map((chip) => (
        <div
          key={chip.label}
          style={{
            position: "absolute",
            ...(chip.left ? { left: chip.left } : {}),
            ...(chip.top ? { top: chip.top } : {}),
            ...(chip.bottom ? { bottom: chip.bottom } : {}),
            padding: "14px 22px",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(14,12,26,0.72)",
            boxShadow: "0 24px 60px -18px rgba(0,0,0,0.7)",
            fontSize: 17,
            fontWeight: FONT_WEIGHTS.medium,
            letterSpacing: 0.4,
            fontFamily: FONT_FAMILY,
            color: "rgba(255,255,255,0.9)",
            transform: `translateY(${(1 - chipP) * 40 + bobY(frame, chip.phase, 10)}px)`,
            opacity: chipP,
          }}
        >
          {chip.label}
        </div>
      ))}
    </div>
  );
};

export const ProductAd: React.FC<ProductAdProps> = ({
  kicker,
  productName,
  headline,
  subheadline,
  price,
  ctaText,
  accent,
  accent2,
}) => {
  const { width, height } = useVideoConfig();
  const clipOpacity = useClipFade();

  const vertical = height > width;
  const is1080p = width >= 1920;

  const textWidth = vertical ? 820 : 980;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0914",
        fontFamily: FONT_FAMILY,
        opacity: clipOpacity,
      }}
    >
      <GlowBackdrop accent={accent} accent2={accent2} />

      {vertical ? (
        /* ------------------------------------------------ 9:16 vertical ad */
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "150px 110px 120px 110px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 46,
            }}
          >
            <RiseIn delay={6} distance={26} style={{ display: "flex" }}>
              <div style={kickerChip()}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: accent2,
                    boxShadow: `0 0 18px ${accent2}`,
                  }}
                />
                {kicker}
              </div>
            </RiseIn>

            <LinesReveal
              text={headline}
              startFrom={12}
              fontSize={is1080p ? 136 : 108}
              align="center"
              lineHeight={1.04}
            />
            <RiseIn delay={30} distance={30}>
              <div
                style={{
                  ...subStyle,
                  textAlign: "center",
                  maxWidth: textWidth,
                  fontSize: is1080p ? 30 : 26,
                }}
              >
                {subheadline}
              </div>
            </RiseIn>
          </div>

          <RiseIn delay={40} distance={70} style={{ display: "flex" }}>
            <ProductVisual
              productName={productName}
              accent={accent}
              accent2={accent2}
              cardWidth={is1080p ? 520 : 460}
              cardHeight={is1080p ? 640 : 560}
            />
          </RiseIn>

          <RiseIn delay={58} distance={40} style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 34,
              }}
            >
              <div style={priceStyle("#fff")}>{price}</div>
              <div style={ctaStyle(accent, accent2)}>
                {ctaText}
                <span style={{ fontSize: 30, lineHeight: 1 }}>→</span>
              </div>
            </div>
          </RiseIn>
        </AbsoluteFill>
      ) : (
        /* ---------------------------------------------- 16:9 landscape ad */
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            padding: "0px 0px 0px 150px",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              maxWidth: 1060,
              gap: 40,
            }}
          >
            <RiseIn delay={6} distance={26} style={{ display: "flex" }}>
              <div style={kickerChip()}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: accent2,
                    boxShadow: `0 0 18px ${accent2}`,
                  }}
                />
                {kicker}
              </div>
            </RiseIn>

            <LinesReveal text={headline} startFrom={12} fontSize={is1080p ? 118 : 92} />

            <RiseIn delay={32} distance={36}>
              <div style={{ ...subStyle, maxWidth: textWidth }}>{subheadline}</div>
            </RiseIn>

            <div style={{ height: 12 }} />

            <RiseIn delay={46} distance={40} style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 44,
                }}
              >
                <div style={priceStyle("#fff")}>{price}</div>
                <div style={ctaStyle(accent, accent2)}>
                  {ctaText}
                  <span style={{ fontSize: 30, lineHeight: 1 }}>→</span>
                </div>
              </div>
            </RiseIn>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <ProductVisual
              productName={productName}
              accent={accent}
              accent2={accent2}
              cardWidth={is1080p ? 430 : 400}
              cardHeight={is1080p ? 560 : 500}
            />
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
