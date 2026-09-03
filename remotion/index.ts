// This is the entry point for the Remotion compositions.
// It is referenced by the CLI and by the render server (server/index.ts):
//
//   npx remotion studio remotion/index.ts
//   npx remotion render remotion/index.ts ProductAd out/video.mp4

import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
