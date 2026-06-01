// Test runner — works in Bun, Node, and Deno (with --allow-read).
//
// Usage:
//   bun tests/run-tests.mjs
//   node tests/run-tests.mjs
//   deno run --allow-read --allow-write tests/run-tests.mjs
//
// Auto-generates tests/test-import.json if missing so the integration
// suite is self-bootstrapping.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, "test-import.json");

if (!fs.existsSync(seedPath)) {
  console.log("tests/test-import.json missing — generating…");
  const { generateSeed } = await import("./generate-seed.mjs");
  fs.writeFileSync(seedPath, JSON.stringify(generateSeed(), null, 2));
}

// Order matters less than you'd think — each file just registers its
// tests with the harness. The runAll() call at the end executes them.
await import("./test-foods.mjs");
await import("./test-stats.mjs");
await import("./test-storage.mjs");
await import("./test-integration.mjs");

const { runAll } = await import("./harness.mjs");
await runAll();
