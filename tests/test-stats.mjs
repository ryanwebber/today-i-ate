// Tests for STATS module — Fisher's exact, risk ratio, BH adjustment,
// analyze() output structure, and wildcard exclusion behavior.

import { suite, test, assert, assertEqual, assertClose } from "./harness.mjs";
import { loadAppModule } from "./loader.mjs";

loadAppModule("js/foods.js");
loadAppModule("js/stats.js");

const { FOODS, STATS } = globalThis;

suite("STATS — Fisher's exact");

test("matches R fisher.test reference for [[8,2],[1,5]]", () => {
  // R: fisher.test(matrix(c(8,2,1,5),nrow=2))$p.value → ~0.0350
  const p = STATS.fishersExact(8, 2, 1, 5);
  assertClose(p, 0.03497, 0.0005);
});

test("returns ~1 for null effect [[5,5],[5,5]]", () => {
  const p = STATS.fishersExact(5, 5, 5, 5);
  assert(p > 0.95, `expected ≈ 1, got ${p}`);
});

test("returns 1 when a marginal is zero", () => {
  assertEqual(STATS.fishersExact(0, 0, 5, 5), 1);
  assertEqual(STATS.fishersExact(5, 5, 0, 0), 1);
});

test("p ≤ 1 for extreme tables", () => {
  const p = STATS.fishersExact(100, 0, 0, 100);
  assert(p >= 0 && p <= 1);
});

suite("STATS — risk ratio");

test("RR for [[8,2],[1,5]] = (8/10) / (1/6) = 4.8", () => {
  assertClose(STATS.riskRatio(8, 2, 1, 5), 4.8, 0.001);
});

test("RR with zero c uses Haldane correction", () => {
  // c=0 → ((a+0.5)/(r1+1)) / ((c+0.5)/(r2+1))
  // = (5.5/11) / (0.5/11) = 11
  const rr = STATS.riskRatio(5, 5, 0, 10);
  assertClose(rr, 11, 0.0001);
});

test("RR returns null when a marginal row is empty", () => {
  assertEqual(STATS.riskRatio(0, 0, 5, 5), null);
  assertEqual(STATS.riskRatio(5, 5, 0, 0), null);
});

suite("STATS — Benjamini-Hochberg");

test("smallest p × n equals smallest q (n=3)", () => {
  // For n=3, smallest p has rank 1, q = p × n / 1 = 3p
  const qs = STATS.benjaminiHochberg([0.001, 0.5, 0.5]);
  assertClose(qs[0], 0.003, 1e-9);
});

test("q-values are monotone non-decreasing in sorted-p order", () => {
  const ps = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216];
  const qs = STATS.benjaminiHochberg(ps);
  // Order them by p; q must be monotone non-decreasing in that order.
  const sorted = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let prev = -Infinity;
  for (const { i } of sorted) {
    assert(qs[i] >= prev - 1e-9, `q at sorted index for p=${ps[i]} dropped: ${qs[i]} < ${prev}`);
    prev = qs[i];
  }
});

test("q-values capped at 1", () => {
  const qs = STATS.benjaminiHochberg([0.9, 0.95, 0.99]);
  for (const q of qs) assert(q <= 1, `q=${q} should be ≤ 1`);
});

test("empty input → empty output", () => {
  const qs = STATS.benjaminiHochberg([]);
  assertEqual(qs.length, 0);
});

suite("STATS — analyze() shape");

test("returns expected fields on tiny dataset", () => {
  const days = {
    "2026-04-01": { foods: ["coffee"], symptom: "yes", note: "" },
    "2026-04-02": { foods: ["coffee"], symptom: "no", note: "" },
    "2026-04-03": { foods: [], symptom: null, note: "" },
  };
  const r = STATS.analyze(days, FOODS.all, []);
  assertEqual(r.totalDays, 3);
  assertEqual(r.analyzedDays, 2);
  assertEqual(r.symptomYes, 1);
  assert(typeof r.baseline === "number");
  assert(Array.isArray(r.rows));
});

test("recentBaseline is null when no recent symptom-tagged days", () => {
  const r = STATS.analyze({}, FOODS.all, []);
  assertEqual(r.recentBaseline, null);
});

suite("STATS — wildcard exclusion");

// Build a dataset where a non-wildcard food's c-cell would be polluted by
// unknown days. The wildcard logic should drop those days from that food's
// table while keeping them in unknown's own analysis.
function buildWildcardDataset() {
  const days = {};
  const k = (n) => `2026-04-${String(n).padStart(2, "0")}`;
  // 8 garlic + symptom yes
  for (let i = 1; i <= 8; i++) days[k(i)] = { foods: ["garlic"], symptom: "yes", note: "" };
  // 4 garlic + symptom no
  for (let i = 9; i <= 12; i++) days[k(i)] = { foods: ["garlic"], symptom: "no", note: "" };
  // 8 plain (no garlic, no unknown), symptom no
  for (let i = 13; i <= 20; i++) days[k(i)] = { foods: ["coffee"], symptom: "no", note: "" };
  // 5 unknown days with symptom yes (would falsely lower garlic's RR if counted)
  for (let i = 21; i <= 25; i++) days[k(i)] = { foods: ["unknown", "coffee"], symptom: "yes", note: "" };
  return days;
}

test("garlic's c (sym & not eaten) excludes unknown days", () => {
  const days = buildWildcardDataset();
  const r = STATS.analyze(days, FOODS.all, []);
  const garlic = r.rows.find((row) => row.foodId === "garlic");
  assertEqual(garlic.eaten, 12, "12 garlic days");
  assertEqual(garlic.notEaten, 8, "8 plain days; 5 unknown days excluded");
  assertEqual(garlic.a, 8);
  assertEqual(garlic.b, 4);
  assertEqual(garlic.c, 0, "no symptom days outside garlic, after wildcard exclusion");
  assertEqual(garlic.d, 8);
});

test("unknown analyzed normally (not excluded from itself)", () => {
  const days = buildWildcardDataset();
  const r = STATS.analyze(days, FOODS.all, []);
  const unk = r.rows.find((row) => row.foodId === "unknown");
  assertEqual(unk.eaten, 5, "5 unknown days");
  assertEqual(unk.notEaten, 20, "all non-unknown days kept for the unknown row itself");
  assertEqual(unk.a, 5);
  assertEqual(unk.b, 0);
});

test("garlic significant after wildcard exclusion", () => {
  const days = buildWildcardDataset();
  const r = STATS.analyze(days, FOODS.all, []);
  const garlic = r.rows.find((row) => row.foodId === "garlic");
  // Table after exclusion: a=8, b=4, c=0, d=8 — clean, significant signal
  assert(garlic.rr >= 2, `expected RR >= 2, got ${garlic.rr}`);
  assert(garlic.p < 0.05, `expected p < 0.05, got ${garlic.p}`);
});
