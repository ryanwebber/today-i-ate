// Persistence layer for today-i-ate.
// All state lives under a single localStorage key, "tia.v1".

window.STORAGE = (function () {
  const KEY = "tia.v1";
  const RECENT_MAX = 20;

  function emptyState() {
    return {
      schemaVersion: 1,
      days: {},
      customFoods: [],
      recentFoodIds: [],
      lastExportAt: null,
      settings: { theme: "auto" },
    };
  }

  let state = null;
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        state = emptyState();
      } else {
        const parsed = JSON.parse(raw);
        state = migrate(parsed);
      }
    } catch (e) {
      console.error("Failed to load state, starting fresh:", e);
      state = emptyState();
    }
  }

  // Maps legacy food IDs to their current replacements. Applied on every
  // load/import so old data round-trips cleanly even after a food list change.
  // - Renames: same ingredient, new id (e.g. wheat_bread → wheat).
  // - Composites: collapsed to their primary atomic ingredient. Lossy on
  //   secondary ingredients (pizza had cheese + tomato too, but at least
  //   the wheat signal is preserved). Users can adjust manually if needed.
  const LEGACY_FOOD_ID_MAP = {
    wheat_bread: "wheat",
    pasta: "wheat",
    pizza: "wheat",
    crackers: "wheat",
    cereal: "wheat",
    hummus: "chickpeas",
  };

  function migrateFoodIdList(ids) {
    if (!Array.isArray(ids)) return [];
    const seen = new Set();
    const out = [];
    for (const id of ids) {
      if (typeof id !== "string") continue;
      const mapped = Object.prototype.hasOwnProperty.call(LEGACY_FOOD_ID_MAP, id)
        ? LEGACY_FOOD_ID_MAP[id]
        : id;
      if (mapped == null) continue;
      if (seen.has(mapped)) continue; // dedupe (e.g. wheat_bread + wheat both → wheat)
      seen.add(mapped);
      out.push(mapped);
    }
    return out;
  }

  function migrate(s) {
    const fresh = emptyState();
    const merged = Object.assign(fresh, s, {
      days: s.days || {},
      customFoods: s.customFoods || [],
      recentFoodIds: s.recentFoodIds || [],
      settings: Object.assign(fresh.settings, s.settings || {}),
    });

    for (const dateKey in merged.days) {
      const day = merged.days[dateKey];
      if (day && Array.isArray(day.foods)) {
        day.foods = migrateFoodIdList(day.foods);
      }
    }
    merged.recentFoodIds = migrateFoodIdList(merged.recentFoodIds);

    return merged;
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    for (const fn of listeners) fn();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getState() {
    return state;
  }

  // Returns an existing day record or a fresh blank one.
  // Does NOT persist a blank — only persists when you call setDay.
  function getDay(dateKey) {
    return state.days[dateKey] || { foods: [], symptom: null, note: "" };
  }

  function setDay(dateKey, dayPatch) {
    const existing = getDay(dateKey);
    const next = Object.assign({}, existing, dayPatch);
    // Drop completely empty entries to keep storage tidy
    if (
      (!next.foods || next.foods.length === 0) &&
      next.symptom === null &&
      (!next.note || next.note.trim() === "")
    ) {
      delete state.days[dateKey];
    } else {
      state.days[dateKey] = next;
    }
    save();
  }

  function toggleFood(dateKey, foodId) {
    const day = getDay(dateKey);
    const foods = day.foods.slice();
    const idx = foods.indexOf(foodId);
    if (idx === -1) {
      foods.push(foodId);
      bumpRecent(foodId);
    } else {
      foods.splice(idx, 1);
    }
    setDay(dateKey, { foods });
  }

  function setSymptom(dateKey, value) {
    setDay(dateKey, { symptom: value });
  }

  function setNote(dateKey, note) {
    setDay(dateKey, { note });
  }

  function bumpRecent(foodId) {
    const list = state.recentFoodIds.filter((id) => id !== foodId);
    list.unshift(foodId);
    state.recentFoodIds = list.slice(0, RECENT_MAX);
  }

  function addCustomFood(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = state.customFoods.find(
      (f) => f.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing;
    const id = "custom_" + Math.random().toString(36).slice(2, 10);
    const entry = { id, name: trimmed, category: "custom", categoryLabel: "Custom" };
    state.customFoods.push(entry);
    save();
    return entry;
  }

  function removeCustomFood(id) {
    state.customFoods = state.customFoods.filter((f) => f.id !== id);
    save();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `today-i-ate-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    state.lastExportAt = new Date().toISOString();
    save();
  }

  // mode: "replace" | "merge"
  function importJson(text, mode) {
    const incoming = JSON.parse(text);
    const migrated = migrate(incoming);
    if (mode === "replace") {
      state = migrated;
    } else {
      // Merge: incoming days win on conflict; custom foods deduped by id
      const merged = emptyState();
      Object.assign(merged, state);
      merged.days = Object.assign({}, state.days, migrated.days);
      const customById = {};
      for (const f of state.customFoods) customById[f.id] = f;
      for (const f of migrated.customFoods) customById[f.id] = f;
      merged.customFoods = Object.values(customById);
      // Recent: prefer incoming order, then existing
      const seen = new Set();
      const recent = [];
      for (const id of migrated.recentFoodIds.concat(state.recentFoodIds)) {
        if (!seen.has(id)) {
          seen.add(id);
          recent.push(id);
        }
      }
      merged.recentFoodIds = recent.slice(0, RECENT_MAX);
      state = merged;
    }
    save();
  }

  function reset() {
    state = emptyState();
    save();
  }

  load();

  return {
    getState,
    subscribe,
    getDay,
    setDay,
    toggleFood,
    setSymptom,
    setNote,
    addCustomFood,
    removeCustomFood,
    exportJson,
    importJson,
    reset,
  };
})();
