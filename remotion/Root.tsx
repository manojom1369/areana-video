import React from "react";
import { Composition } from "remotion";
import { ensureFontsLoaded } from "./lib/fonts";
import { MotionProjectView } from "../shared/motion/MotionProjectView";
import { parseProject } from "../shared/motion/model";
import { makeDemoProject } from "../shared/motion/engine";
import {
  AD_DURATION_IN_FRAMES,
  AD_FPS,
  AD_HEIGHT,
  AD_VERTICAL_HEIGHT,
  AD_VERTICAL_WIDTH,
  AD_WIDTH,
  productAdDefaultProps,
  productAdSchema,
  ProductAd,
} from "./templates/ProductAd";

// Kick off the font loading once, when the bundle is imported.
ensureFontsLoaded();

const FPS = 30;
const MOTION_MAX_DURATION = 300;

/**
 * Motion editor compositions: they render any "motion project" JSON
 * (see shared/motion/model.ts) passed via inputProps:
 *   { "project": { "width": 1920, "height": 1080, ... } }
 */
const MotionWrapper: React.FC<{ readonly project: unknown }> = ({ project }) => {
  const parsed = parseProject(project);
  return <MotionProjectView project={parsed} />;
};

const makeMotionProps = (width: number, height: number) => ({
  project: makeDemoProject(width, height, MOTION_MAX_DURATION),
});

// Each <Composition> is an entry in the Remotion Studio sidebar and can be
// rendered by id, e.g.:
//   npx remotion render remotion/index.ts ProductAd out/product-ad.mp4
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ProductAd"
        component={ProductAd}
        durationInFrames={AD_DURATION_IN_FRAMES}
        fps={AD_FPS}
        width={AD_WIDTH}
        height={AD_HEIGHT}
        schema={productAdSchema}
        defaultProps={productAdDefaultProps}
      />
      <Composition
        id="ProductAdVertical"
        component={ProductAd}
        durationInFrames={AD_DURATION_IN_FRAMES}
        fps={AD_FPS}
        width={AD_VERTICAL_WIDTH}
        height={AD_VERTICAL_HEIGHT}
        schema={productAdSchema}
        defaultProps={productAdDefaultProps}
      />
      <Composition
        id="MotionLandscape"
        component={MotionWrapper}
        durationInFrames={MOTION_MAX_DURATION}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={makeMotionProps(1920, 1080)}
      />
      <Composition
        id="MotionPortrait"
        component={MotionWrapper}
        durationInFrames={MOTION_MAX_DURATION}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={makeMotionProps(1080, 1920)}
      />
    </>
  );
};
