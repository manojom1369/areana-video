import { createRoot } from "react-dom/client";
import { EditorApp } from "./app";
import "./editor.css";

/** Preload the vendored Montserrat weights (same files the renders use). */
const preloadFonts = (): void => {
  const weights = [400, 500, 600, 700, 800, 900];
  for (const weight of weights) {
    const face = new FontFace(
      "Montserrat",
      `url('/fonts/Montserrat-${weight}.woff2') format('woff2')`,
      { style: "normal", weight: String(weight) },
    );
    face.load().then((f) => document.fonts.add(f)).catch(() => undefined);
  }
};

preloadFonts();

const container = document.getElementById("root");
if (!container) {
  throw new Error("No #root element");
}
createRoot(container).render(<EditorApp />);
