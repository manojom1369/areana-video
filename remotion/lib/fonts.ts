import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Montserrat is vendored in public/fonts (see scripts/copy-fonts.mjs) and
 * loaded here with FontFace, so renders never touch the network.
 * (Pattern inspired by the official Remotion TikTok template.)
 */

export const FONT_FAMILY = "Montserrat";

export const FONT_WEIGHTS = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
  black: "900",
} as const;

let fontPromise: Promise<void> | null = null;

const loadFontsImpl = (): Promise<void> => {
  const weights = Object.values(FONT_WEIGHTS);
  const handle = delayRender("Loading Montserrat fonts");

  const faces = weights.map(
    (weight) =>
      new FontFace(
        FONT_FAMILY,
        `url('${staticFile(`fonts/Montserrat-${weight}.woff2`)}') format('woff2')`,
        { style: "normal", weight },
      ),
  );

  return Promise.all(faces.map((face) => face.load()))
    .then((loaded) => {
      for (const face of loaded) {
        document.fonts.add(face);
      }
    })
    .finally(() => {
      continueRender(handle);
    });
};

/**
 * Loads the font once and blocks the first render until it is ready.
 * Safe to call from any composition or component.
 */
export const ensureFontsLoaded = (): Promise<void> => {
  if (!fontPromise) {
    fontPromise = loadFontsImpl().catch((err) => {
      console.error("Font loading failed, falling back to system fonts", err);
    });
  }
  return fontPromise;
};
