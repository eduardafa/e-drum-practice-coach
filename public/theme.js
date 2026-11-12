// Applies a saved Light or Dark choice before the page draws, so it never
// flashes the other theme first. "System" saves nothing: CSS follows the
// device on its own. Loaded as a plain blocking script from <head>; keep the
// key and values in step with src/theme.ts.
try {
  var choice = localStorage.getItem("edrum-coach:theme");
  if (choice === "light" || choice === "dark") document.documentElement.dataset.theme = choice;
} catch {
  // Storage blocked: follow the device.
}
