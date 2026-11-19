import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./App.css";

// The app uses Temporal for dates and times. Safari's engine doesn't have it yet, and every iPhone browser runs on
// that engine, so the polyfill loads first where it's missing (browsers that have Temporal never download it). App
// is imported after it, because App's modules may use Temporal as soon as they load.
if (!("Temporal" in globalThis)) await import("temporal-polyfill/global");
const { default: App } = await import("./App");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
