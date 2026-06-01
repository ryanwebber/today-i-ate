// Tests for FOODS module — composition, byId, custom resolve, wildcard.

import { suite, test, assert, assertEqual } from "./harness.mjs";
import { loadAppModule } from "./loader.mjs";

loadAppModule("js/foods.js");

suite("FOODS");

test("FOODS.all is a non-empty array", () => {
  assert(Array.isArray(globalThis.FOODS.all));
  assert(globalThis.FOODS.all.length > 50, "expected at least 50 entries");
});

test("every entry has id, name, category, categoryLabel", () => {
  for (const f of globalThis.FOODS.all) {
    assert(typeof f.id === "string" && f.id.length > 0, `bad id: ${JSON.stringify(f)}`);
    assert(typeof f.name === "string" && f.name.length > 0);
    assert(typeof f.category === "string");
    assert(typeof f.categoryLabel === "string");
  }
});

test("FOODS.byId is consistent with FOODS.all", () => {
  for (const f of globalThis.FOODS.all) {
    assertEqual(globalThis.FOODS.byId[f.id], f, `byId[${f.id}] should be the same reference`);
  }
});

test("composite foods removed: pasta, pizza, crackers, cereal, hummus", () => {
  const removed = ["pasta", "pizza", "crackers", "cereal", "hummus", "wheat_bread"];
  for (const id of removed) {
    assert(!globalThis.FOODS.byId[id], `${id} should not be in the list`);
  }
});

test("atomic ingredients present: wheat, garlic, soft_cheese, yeast, barley", () => {
  for (const id of ["wheat", "garlic", "soft_cheese", "yeast", "barley"]) {
    assert(globalThis.FOODS.byId[id], `${id} should be in the list`);
  }
});

test("wildcard 'unknown' is registered with its own category", () => {
  assert(globalThis.FOODS.byId.unknown, "unknown entry exists");
  assertEqual(globalThis.FOODS.byId.unknown.category, "wildcard");
  assertEqual(globalThis.FOODS.unknown, globalThis.FOODS.byId.unknown);
});

test("'unknown' is NOT in any displayed category", () => {
  const visibleCats = new Set(globalThis.FOODS.categories.map((c) => c.id));
  assert(!visibleCats.has("wildcard"), "wildcard category should not be in displayed categories");
});

test("resolve() returns built-in entry by id", () => {
  const r = globalThis.FOODS.resolve("garlic", []);
  assertEqual(r.name, "Garlic");
});

test("resolve() finds custom foods", () => {
  const custom = [{ id: "custom_xyz", name: "Brand X bar", category: "custom", categoryLabel: "Custom" }];
  const r = globalThis.FOODS.resolve("custom_xyz", custom);
  assertEqual(r.name, "Brand X bar");
});

test("resolve() falls back gracefully for unknown ids", () => {
  const r = globalThis.FOODS.resolve("zzz_nope", []);
  assertEqual(r.id, "zzz_nope");
  assertEqual(r.name, "zzz_nope");
});
