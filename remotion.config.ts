// All configuration options: https://www.remotion.dev/docs/config
// Each option is also available as a CLI flag: https://www.remotion.dev/docs/cli
//
// Note: this file only applies to the CLI (`remotion studio`, `remotion render`).
// The Express render server (server/) passes options directly to the Node.JS APIs.

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// In sandboxes/CI without internet access, Remotion cannot download its
// headless Chrome — point BROWSER_EXECUTABLE at a local Chromium instead.
if (process.env.BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.BROWSER_EXECUTABLE);
}
