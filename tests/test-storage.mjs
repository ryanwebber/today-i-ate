// Tests for STORAGE module — day round-trip, toggle, custom foods,
// recents bumping, import/export-replace round-trip.

import { suite, test, assert, assertEqual } from "./harness.mjs";
import { loadAppModule } from "./loader.mjs";

// In-memory localStorage shim (must be installed BEFORE storage.js loads
// so its IIFE finds something to call).
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear: () => _store.clear(),
};

loadAppModule("js/storage.js");

const { STORAGE } = globalThis;

suite("STORAGE");

test("starts empty after reset", () => {
  STORAGE.reset();
  const state = STORAGE.getState();
  assertEqual(Object.keys(state.days).length, 0);
  assertEqual(state.customFoods.length, 0);
  assertEqual(state.recentFoodIds.length, 0);
});

test("setDay then getDay round-trips foods, symptom, note", () => {
  STORAGE.reset();
  STORAGE.setDay("2026-06-01", { foods: ["coffee", "garlic"], symptom: "yes", note: "test" });
  const day = STORAGE.getDay("2026-06-01");
  assertEqual(day.symptom, "yes");
  assertEqual(day.note, "test");
  assert(day.foods.includes("coffee"));
  assert(day.foods.includes("garlic"));
});

test("getDay returns blank record for unset dates", () => {
  STORAGE.reset();
  const day = STORAGE.getDay("2099-01-01");
  assertEqual(day.symptom, null);
  assertEqual(day.foods.length, 0);
  assertEqual(day.note, "");
});

test("toggleFood adds then removes", () => {
  STORAGE.reset();
  STORAGE.toggleFood("2026-06-01", "milk");
  assert(STORAGE.getDay("2026-06-01").foods.includes("milk"));
  STORAGE.toggleFood("2026-06-01", "milk");
  assert(!STORAGE.getDay("2026-06-01").foods.includes("milk"));
});

test("toggleFood bumps the food to the top of recents (MRU)", () => {
  STORAGE.reset();
  STORAGE.toggleFood("2026-06-01", "wheat");
  STORAGE.toggleFood("2026-06-01", "rice");
  STORAGE.toggleFood("2026-06-01", "garlic");
  const recents = STORAGE.getState().recentFoodIds;
  assertEqual(recents[0], "garlic");
  assertEqual(recents[1], "rice");
  assertEqual(recents[2], "wheat");
});

test("addCustomFood creates a stable entry and is idempotent on name match", () => {
  STORAGE.reset();
  const a = STORAGE.addCustomFood("Brand X bar");
  const b = STORAGE.addCustomFood("Brand X bar");
  assertEqual(a.id, b.id, "same name should resolve to same entry");
  assert(a.id.startsWith("custom_"));
  assertEqual(a.name, "Brand X bar");
  assertEqual(a.category, "custom");
});

test("addCustomFood ignores empty input", () => {
  STORAGE.reset();
  const a = STORAGE.addCustomFood("");
  const b = STORAGE.addCustomFood("   ");
  assertEqual(a, null);
  assertEqual(b, null);
  assertEqual(STORAGE.getState().customFoods.length, 0);
});

test("setSymptom writes the day", () => {
  STORAGE.reset();
  STORAGE.setSymptom("2026-06-01", "yes");
  assertEqual(STORAGE.getDay("2026-06-01").symptom, "yes");
  STORAGE.setSymptom("2026-06-01", null);
  // Day should be dropped entirely if otherwise empty
  assert(!STORAGE.getState().days["2026-06-01"]);
});

test("days with all-empty fields are dropped from storage", () => {
  STORAGE.reset();
  STORAGE.setDay("2026-06-01", { foods: ["coffee"], symptom: "yes", note: "" });
  STORAGE.setDay("2026-06-01", { foods: [], symptom: null, note: "" });
  assert(!STORAGE.getState().days["2026-06-01"], "empty record should be removed");
});

test("importJson(replace) wipes existing state and loads incoming", () => {
  STORAGE.reset();
  STORAGE.setDay("2026-06-01", { foods: ["coffee"], symptom: "yes", note: "" });
  const incoming = JSON.stringify({
    schemaVersion: 1,
    days: { "2026-07-01": { foods: ["milk"], symptom: "no", note: "" } },
    customFoods: [],
    recentFoodIds: ["milk"],
    settings: { theme: "auto" },
  });
  STORAGE.importJson(incoming, "replace");
  const state = STORAGE.getState();
  assert(state.days["2026-07-01"]);
  assert(!state.days["2026-06-01"]);
  assertEqual(state.recentFoodIds[0], "milk");
});

test("importJson(merge) keeps existing days, incoming wins on conflict", () => {
  STORAGE.reset();
  STORAGE.setDay("2026-06-01", { foods: ["coffee"], symptom: "yes", note: "old" });
  STORAGE.setDay("2026-06-02", { foods: ["rice"], symptom: "no", note: "" });
  const incoming = JSON.stringify({
    schemaVersion: 1,
    days: {
      "2026-06-01": { foods: ["milk"], symptom: "no", note: "new" },  // conflict
      "2026-07-01": { foods: ["wheat"], symptom: "yes", note: "" },   // new
    },
    customFoods: [],
    recentFoodIds: [],
    settings: {},
  });
  STORAGE.importJson(incoming, "merge");
  const state = STORAGE.getState();
  assertEqual(state.days["2026-06-01"].note, "new", "incoming should win");
  assert(state.days["2026-06-02"], "non-conflicting existing day kept");
  assert(state.days["2026-07-01"], "new day added");
});

suite("STORAGE — legacy ID migration");

test("rename: wheat_bread → wheat in days", () => {
  STORAGE.reset();
  const incoming = JSON.stringify({
    schemaVersion: 1,
    days: { "2026-06-01": { foods: ["wheat_bread", "garlic"], symptom: "yes", note: "" } },
    customFoods: [],
    recentFoodIds: [],
    settings: {},
  });
  STORAGE.importJson(incoming, "replace");
  const day = STORAGE.getDay("2026-06-01");
  assert(day.foods.includes("wheat"), "should have wheat");
  assert(!day.foods.includes("wheat_bread"), "should NOT have wheat_bread");
  assert(day.foods.includes("garlic"));
});

test("composites collapse to primary ingredient", () => {
  STORAGE.reset();
  const incoming = JSON.stringify({
    schemaVersion: 1,
    days: {
      "2026-06-01": { foods: ["pasta"],    symptom: "yes", note: "" },
      "2026-06-02": { foods: ["pizza"],    symptom: "no",  note: "" },
      "2026-06-03": { foods: ["crackers"], symptom: "yes", note: "" },
      "2026-06-04": { foods: ["cereal"],   symptom: "no",  note: "" },
      "2026-06-05": { foods: ["hummus"],   symptom: "yes", note: "" },
    },
    customFoods: [],
    recentFoodIds: [],
    settings: {},
  });
  STORAGE.importJson(incoming, "replace");
  const days = STORAGE.getState().days;
  assertEqual(days["2026-06-01"].foods[0], "wheat");
  assertEqual(days["2026-06-02"].foods[0], "wheat");
  assertEqual(days["2026-06-03"].foods[0], "wheat");
  assertEqual(days["2026-06-04"].foods[0], "wheat");
  assertEqual(days["2026-06-05"].foods[0], "chickpeas");
});

test("recents are migrated and deduped", () => {
  STORAGE.reset();
  const incoming = JSON.stringify({
    schemaVersion: 1,
    days: {},
    customFoods: [],
    // wheat_bread and pasta both map to wheat; should collapse with the
    // existing "wheat" entry into a single deduped recents list.
    recentFoodIds: ["wheat_bread", "wheat", "pasta", "garlic"],
    settings: {},
  });
  STORAGE.importJson(incoming, "replace");
  const recents = STORAGE.getState().recentFoodIds;
  assertEqual(recents.length, 2, "duplicates collapsed");
  assertEqual(recents[0], "wheat");
  assertEqual(recents[1], "garlic");
});

test("days with multiple legacy ids dedupe to single new id", () => {
  STORAGE.reset();
  const incoming = JSON.stringify({
    schemaVersion: 1,
    days: { "2026-06-01": { foods: ["pasta", "wheat_bread", "wheat"], symptom: "yes", note: "" } },
    customFoods: [],
    recentFoodIds: [],
    settings: {},
  });
  STORAGE.importJson(incoming, "replace");
  const day = STORAGE.getDay("2026-06-01");
  assertEqual(day.foods.length, 1, "all three pasta/wheat_bread/wheat collapse");
  assertEqual(day.foods[0], "wheat");
});

test("migration is idempotent — already-new IDs are preserved", () => {
  STORAGE.reset();
  const incoming = JSON.stringify({
    schemaVersion: 1,
    days: { "2026-06-01": { foods: ["wheat", "garlic"], symptom: "yes", note: "" } },
    customFoods: [],
    recentFoodIds: ["wheat", "garlic"],
    settings: {},
  });
  STORAGE.importJson(incoming, "replace");
  const day = STORAGE.getDay("2026-06-01");
  assertEqual(day.foods.length, 2);
  assertEqual(day.foods[0], "wheat");
  assertEqual(day.foods[1], "garlic");
});

test("unknown legacy ids pass through unchanged (won't crash)", () => {
  STORAGE.reset();
  const incoming = JSON.stringify({
    schemaVersion: 1,
    days: { "2026-06-01": { foods: ["something_obscure", "wheat"], symptom: "yes", note: "" } },
    customFoods: [],
    recentFoodIds: [],
    settings: {},
  });
  STORAGE.importJson(incoming, "replace");
  const day = STORAGE.getDay("2026-06-01");
  assert(day.foods.includes("something_obscure"));
  assert(day.foods.includes("wheat"));
});
