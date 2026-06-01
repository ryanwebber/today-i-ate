// Integration test — runs STATS.analyze against the seeded dataset
// (tests/test-import.json) and verifies the end-to-end pipeline still
// surfaces the planted truths: garlic significant, wildcard's exclusion
// keeps garlic's signal sharp.

import { suite, test, assert, assertEqual } from "./harness.mjs";
import { loadAppModule, readJson } from "./loader.mjs";

loadAppModule("js/foods.js");
loadAppModule("js/stats.js");

const { FOODS, STATS } = globalThis;

suite("integration — seeded dataset");

let result;
try {
  const seed = readJson("tests/test-import.json");
  result = STATS.analyze(seed.days, FOODS.all, seed.customFoods);
} catch (e) {
  // Seed file missing — register a single failing test so the runner reports it.
  test("seed file present (run generate-seed.mjs)", () => {
    throw new Error("tests/test-import.json missing — " + e.message);
  });
}

if (result) {
  test("seed produced ~70 days of data", () => {
    assert(result.totalDays >= 60 && result.totalDays <= 80, `got ${result.totalDays}`);
  });

  test("baseline symptom rate is reasonable (5-80%)", () => {
    assert(result.baseline > 0.05 && result.baseline < 0.8, `baseline=${result.baseline}`);
  });

  test("garlic is flagged significant (q ≤ 0.10)", () => {
    const garlic = result.rows.find((r) => r.foodId === "garlic");
    assert(garlic, "garlic row exists");
    assert(garlic.enough, "garlic should have enough data");
    assert(garlic.rr > 1.5, `expected RR > 1.5, got ${garlic.rr}`);
    assert(garlic.q <= 0.10, `expected q ≤ 0.10, got ${garlic.q}`);
    assertEqual(garlic.badge, "significant");
  });

  test("rice (neutral filler) is not flagged significant", () => {
    const rice = result.rows.find((r) => r.foodId === "rice");
    assert(rice, "rice row exists");
    if (rice.enough) {
      assert(rice.badge !== "significant", `rice should not be significant; got ${rice.badge}`);
    }
  });

  test("unknown row is analyzed (not skipped)", () => {
    const unk = result.rows.find((r) => r.foodId === "unknown");
    assert(unk, "unknown row exists");
    // It should at least have some "ate" days from the seed
    assert(unk.eaten > 0, `expected unknown.eaten > 0, got ${unk.eaten}`);
  });
}
