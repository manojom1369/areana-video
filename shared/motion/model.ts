import { z } from "zod";

/**
 * Motion-design project model — the "document" the editor builds and the
 * Remotion compositions render. This file is shared between:
 *   - the Remotion render bundle (remotion/)
 *   - the Express render API (server/)
 *   - the web editor (editor/)
 *
 * Modeled on the concepts of timeline editors (Alight Motion etc.):
 * layers on top of a background, keyframe-animated transform properties.
 */

export const EASING_NAMES = [
  "linear",
  "easeInQuad",
  "easeOutQuad",
  "easeInOutQuad",
  "easeOutCubic",
  "easeOutBack",
] as const;

export type EasingName = (typeof EASING_NAMES)[number];

export const PROP_KEYS = ["x", "y", "scale", "rotation", "opacity"] as const;
export type PropKey = (typeof PROP_KEYS)[number];

export const PROP_LABELS: Record<PropKey, string> = {
  x: "X",
  y: "Y",
  scale: "Scale",
  rotation: "Rotation",
  opacity: "Opacity",
};

// ------------------------------------------------------------------ zod

export const easingSchema = z.enum(EASING_NAMES);

export const keyframeSchema = z.object({
  t: z.number().int().min(0),
  value: z.number(),
  easing: easingSchema,
});

export type Keyframe = z.infer<typeof keyframeSchema>;

export type LayerTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  keyframes: Partial<Record<PropKey, Keyframe[]>>;
};

export const transformSchema: z.ZodType<LayerTransform> = z.object({
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  scale: z.number().min(0).max(10),
  rotation: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
  keyframes: z
    .object({
      x: z.array(keyframeSchema).optional(),
      y: z.array(keyframeSchema).optional(),
      scale: z.array(keyframeSchema).optional(),
      rotation: z.array(keyframeSchema).optional(),
      opacity: z.array(keyframeSchema).optional(),
    })
    .default({}),
});

export const textLayerSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  name: z.string().optional(),
  visible: z.boolean(),
  text: z.string().max(500),
  fontSize: z.number().min(4).max(600),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100).default(700),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  align: z.enum(["left", "center", "right"]).default("center"),
  maxWidth: z.number().min(20).max(4000).optional(),
  letterSpacing: z.number().min(-10).max(100).default(0),
  lineHeight: z.number().min(0.5).max(3).default(1.15),
  transform: transformSchema,
});

export const shapeLayerSchema = z.object({
  id: z.string(),
  type: z.literal("shape"),
  name: z.string().optional(),
  visible: z.boolean(),
  shapeKind: z.enum(["rect", "ellipse"]),
  width: z.number().min(1).max(4000),
  height: z.number().min(1).max(4000),
  radius: z.number().min(0).max(2000).default(0), // rect corner radius
  fill: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  transform: transformSchema,
});

export const layerSchema = z.discriminatedUnion("type", [
  textLayerSchema,
  shapeLayerSchema,
]);

export const backgroundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: z.string().regex(/^#([0-9a-fA-F]{6})$/) }),
  z.object({
    type: z.literal("linear"),
    from: z.string().regex(/^#([0-9a-fA-F]{6})$/),
    to: z.string().regex(/^#([0-9a-fA-F]{6})$/),
    angle: z.number().min(0).max(360).default(160),
  }),
]);

export const projectSchema = z.object({
  version: z.literal(1),
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fps: z.literal(30),
  durationInFrames: z.number().int().min(2).max(900),
  background: backgroundSchema,
  fontFamily: z.string().max(80).default("Montserrat"),
  layers: z.array(layerSchema).max(60),
}).strict();

export type MotionProject = z.infer<typeof projectSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type ShapeLayer = z.infer<typeof shapeLayerSchema>;

export const parseProject = (input: unknown): MotionProject => {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid motion project: ${parsed.error.issues[0]?.message ?? "schema error"}`);
  }
  return parsed.data;
};

export const makeLayerId = (): string =>
  `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
