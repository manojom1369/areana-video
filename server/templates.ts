/**
 * Registry of renderable templates exposed by the API.
 *
 * NOTE: the authoritative list of compositions lives in remotion/Root.tsx and
 * the real defaults live in remotion/templates/*.tsx. This file mirrors them
 * so the server (and the demo web UI) can describe templates without loading
 * the React/Remotion bundle at runtime. When you add a template, update:
 *   1. remotion/Root.tsx          → register the <Composition>
 *   2. remotion/templates/...     → schema + defaultProps
 *   3. this file                  → metadata for the API/UI
 */

import { makeDemoProject } from "../shared/motion/engine";
import { parseProject, type MotionProject } from "../shared/motion/model";

export type FieldType = "text" | "textarea" | "color";

export type TemplateField = {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly group: string;
};

export type TemplateMeta = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationInFrames: number;
  readonly durationSeconds: number;
  readonly defaultProps: Record<string, string>;
  readonly fields: TemplateField[];
};

const PRODUCT_AD_DEFAULTS = {
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

const PRODUCT_AD_FIELDS: TemplateField[] = [
  { key: "kicker", label: "Kicker / eyebrow", type: "text", group: "Content" },
  { key: "productName", label: "Product name", type: "text", group: "Content" },
  { key: "headline", label: "Headline (use \\n for a new line)", type: "textarea", group: "Content" },
  { key: "subheadline", label: "Subheadline", type: "textarea", group: "Content" },
  { key: "price", label: "Price", type: "text", group: "Offer" },
  { key: "ctaText", label: "Call-to-action text", type: "text", group: "Offer" },
  { key: "accent", label: "Accent color", type: "color", group: "Style" },
  { key: "accent2", label: "Second accent color", type: "color", group: "Style" },
];

export const TEMPLATES: TemplateMeta[] = [
  {
    id: "ProductAd",
    label: "Product Ad — 16:9",
    description:
      "Landscape product drop ad: headline, price and call-to-action beside a glowing product card. 1920×1080, 10s.",
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 300,
    durationSeconds: 10,
    defaultProps: PRODUCT_AD_DEFAULTS,
    fields: PRODUCT_AD_FIELDS,
  },
  {
    id: "ProductAdVertical",
    label: "Product Ad — 9:16 (Reels/Shorts)",
    description:
      "Vertical product drop ad for social stories and short-form video. 1080×1920, 10s.",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 300,
    durationSeconds: 10,
    defaultProps: PRODUCT_AD_DEFAULTS,
    fields: PRODUCT_AD_FIELDS,
  },
];

export const getTemplate = (id: string): TemplateMeta | undefined =>
  TEMPLATES.find((t) => t.id === id);

// ---------------------------------------------------------------------------
// Motion editor presets
//
// The editor ("/editor.html") produces "motion projects" (see
// shared/motion/model.ts) which are rendered by the MotionLandscape /
// MotionPortrait compositions registered in remotion/Root.tsx. Each preset is
// a fixed canvas; projects may be shorter than the 10 s composition duration,
// the API trims the render with a frame range in that case.

export type MotionPreset = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly fps: 30;
  /** Fixed duration of the registered composition (frames). */
  readonly maxDurationInFrames: number;
  readonly defaultProject: MotionProject;
};

const FPS = 30;
const MOTION_MAX_FRAMES = 300;

export const MOTION_PRESETS: MotionPreset[] = [
  {
    id: "MotionLandscape",
    label: "Motion canvas — 16:9",
    description:
      "Timeline editor output for landscape videos (1920×1080, up to 10 s).",
    width: 1920,
    height: 1080,
    fps: FPS,
    maxDurationInFrames: MOTION_MAX_FRAMES,
    defaultProject: makeDemoProject(1920, 1080, MOTION_MAX_FRAMES),
  },
  {
    id: "MotionPortrait",
    label: "Motion canvas — 9:16",
    description:
      "Timeline editor output for vertical videos (1080×1920, up to 10 s).",
    width: 1080,
    height: 1920,
    fps: FPS,
    maxDurationInFrames: MOTION_MAX_FRAMES,
    defaultProject: makeDemoProject(1080, 1920, MOTION_MAX_FRAMES),
  },
];

export const getMotionPreset = (id: string): MotionPreset | undefined =>
  MOTION_PRESETS.find((p) => p.id === id);

/** Validates a motion-project job payload and returns safe render props. */
export const validateMotionJob = (
  presetId: string,
  body: unknown,
): { ok: true; props: { project: MotionProject } } | { ok: false; error: string } => {
  const preset = getMotionPreset(presetId);
  if (!preset) {
    return { ok: false, error: `Unknown motion preset "${presetId}".` };
  }
  const props = (body as { props?: unknown })?.props;
  const raw = (props as { project?: unknown } | undefined)?.project;
  if (raw === undefined) {
    return { ok: false, error: `props.project is required (a motion project JSON object).` };
  }
  try {
    const project = parseProject(raw);
    if (project.width !== preset.width || project.height !== preset.height) {
      return {
        ok: false,
        error: `Project canvas ${project.width}×${project.height} does not match preset ${preset.width}×${preset.height}.`,
      };
    }
    if (project.durationInFrames > preset.maxDurationInFrames) {
      return {
        ok: false,
        error: `Project duration ${project.durationInFrames} frames exceeds preset maximum ${preset.maxDurationInFrames}.`,
      };
    }
    return { ok: true, props: { project } };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};
