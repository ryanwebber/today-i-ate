// Generates synthetic 70-day food/symptom data for tests.
//
// Two truths are baked in:
//   - garlic causes symptoms at +0.55 probability
//   - soft cheese causes symptoms at +0.40 probability
//
// And a confounder:
//   - ~22% of days the user logs "unknown" (e.g. ate at a restaurant).
//     On those days, garlic is hidden in the meal 55% of the time but
//     isn't logged. This stresses the wildcard exclusion in stats.js.
//
// Run directly to write tests/test-import.json:
//   bun tests/generate-seed.mjs
//   node tests/generate-seed.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pad2(n) { return String(n).padStart(2, "0"); }

function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function generateSeed({ daysBack = 70, anchorISO = "2026-05-31", seed = 20260531 } = {}) {
  const r = rand(seed);
  const today = new Date(anchorISO + "T00:00:00");

  const dailyFoods   = ["coffee", "eggs"];
  const commonFoods  = ["wheat", "rice", "chicken", "tomato", "lettuce", "potato", "apple", "banana"];
  const occasional   = ["soft_cheese", "garlic", "onion", "spinach", "salmon", "yogurt", "milk", "butter", "berries", "almonds", "custom_padthai"];

  const triggers = { garlic: 0.55, soft_cheese: 0.40 };

  const days = {};
  const counts = {};

  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const foods = [];

    for (const f of dailyFoods) if (r() < 0.92) foods.push(f);
    for (const f of commonFoods) if (r() < 0.4) foods.push(f);
    for (const f of occasional) {
      let p = 0.22;
      if (f === "onion" && foods.indexOf("garlic") !== -1) p = 0.72;
      if (f === "custom_padthai") p = 0.05;
      if (r() < p) foods.push(f);
    }

    const ateUnknown = r() < 0.22;
    let hiddenGarlic = false;
    if (ateUnknown) {
      foods.push("unknown");
      hiddenGarlic = r() < 0.55;
    }

    let p = 0.12;
    for (const t in triggers) if (foods.indexOf(t) !== -1) p += triggers[t];
    if (hiddenGarlic) p += triggers.garlic;
    p = Math.min(p, 0.92);

    let symptom = r() < p ? "yes" : "no";
    if (r() < 0.04) symptom = null;

    days[key] = { foods, symptom, note: "" };
    for (const f of foods) counts[f] = (counts[f] || 0) + 1;
  }

  const recent = Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, 20);

  return {
    schemaVersion: 1,
    days,
    customFoods: [
      { id: "custom_padthai", name: "Restaurant pad thai", category: "custom", categoryLabel: "Custom" },
    ],
    recentFoodIds: recent,
    lastExportAt: null,
    settings: { theme: "auto" },
  };
}

// When run directly, write test-import.json next to this file.
const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  const data = generateSeed();
  const outPath = path.join(__dirname, "test-import.json");
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));

  const dayCount = Object.keys(data.days).length;
  let yes = 0, no = 0, unset = 0;
  for (const k in data.days) {
    const d = data.days[k];
    if (d.symptom === "yes") yes++;
    else if (d.symptom === "no") no++;
    else unset++;
  }
  console.log(`Wrote tests/test-import.json (${dayCount} days: ${yes} yes / ${no} no / ${unset} unset)`);
}
