// Loads the app's browser scripts (foods.js, storage.js, stats.js) inside
// the test runtime. These files use the `window.X = (function(){...})()`
// pattern, so we evaluate their source with `window` bound to globalThis.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

export function loadAppModule(relativePath) {
  const code = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  // Function constructor evaluates in global scope; `window` becomes a
  // local parameter, so `window.FOODS = ...` resolves to globalThis.FOODS.
  const fn = new Function("window", code);
  fn(globalThis);
}

export function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

export function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}
