import React from "react";
import { Composition } from "remotion";
import { ensureFontsLoaded } from "./lib/fonts";
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
    </>
  );
};
