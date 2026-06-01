// today-i-ate main entry. Renders all views and wires events.

(function () {
  // ---------- Date helpers ----------

  function pad2(n) { return String(n).padStart(2, "0"); }

  function dateKey(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function shiftDay(key, delta) {
    const d = parseKey(key);
    d.setDate(d.getDate() + delta);
    return dateKey(d);
  }

  function relativeDayLabel(key) {
    const t = todayKey();
    if (key === t) return "Today";
    if (key === shiftDay(t, -1)) return "Yesterday";
    if (key === shiftDay(t, 1)) return "Tomorrow";
    const d = parseKey(key);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  }

  // ---------- View state ----------

  const ui = {
    tab: "today",
    date: todayKey(),
    calendar: (() => {
      const n = new Date();
      return { year: n.getFullYear(), month: n.getMonth() };
    })(),
    search: "",
    fabOpen: false,
  };

  // ---------- DOM helpers ----------

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === "class") node.className = props[k];
        else if (k === "dataset") Object.assign(node.dataset, props[k]);
        else if (k.startsWith("on") && typeof props[k] === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else if (k === "html") node.innerHTML = props[k];
        else if (k in node) node[k] = props[k];
        else node.setAttribute(k, props[k]);
      }
    }
    if (children) {
      for (const c of [].concat(children)) {
        if (c == null || c === false) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  // ---------- Tab switching ----------

  const VALID_TABS = ["today", "calendar", "insights"];

  function tabFromHash() {
    const h = (location.hash || "").replace(/^#\/?/, "").trim();
    return VALID_TABS.indexOf(h) !== -1 ? h : "today";
  }

  function setTab(tab, opts) {
    if (tab === "menu") {
      $("#menu-sheet").showModal();
      return;
    }
    ui.tab = tab;
    document.body.dataset.tab = tab;
    // Closing the symptom radial when leaving Today keeps state coherent
    if (tab !== "today" && ui.fabOpen) ui.fabOpen = false;
    if (!(opts && opts.fromHash)) {
      const desired = "#" + tab;
      if (location.hash !== desired) {
        history.replaceState(null, "", desired);
      }
    }
    $$("[data-view]").forEach((v) => {
      v.hidden = v.dataset.view !== tab;
    });
    $$(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tab);
    });
    if (tab === "today") renderToday();
    else if (tab === "calendar") renderCalendar();
    else if (tab === "insights") renderInsights();
    renderFab();
  }

  // ---------- Today view ----------

  function renderToday() {
    const day = STORAGE.getDay(ui.date);
    const state = STORAGE.getState();

    // Header
    $("#day-label-text").textContent = relativeDayLabel(ui.date);
    $("#day-date-input").value = ui.date;

    // Logged chips
    const loggedRoot = $("#logged-chips");
    loggedRoot.innerHTML = "";
    if (day.foods.length === 0) {
      loggedRoot.appendChild(el("div", { class: "chip-empty" }, "Nothing logged yet."));
    } else {
      for (const id of day.foods) {
        const f = FOODS.resolve(id, state.customFoods);
        loggedRoot.appendChild(
          el(
            "button",
            {
              class: "chip selected",
              onClick: () => {
                STORAGE.toggleFood(ui.date, id);
                renderToday();
              },
            },
            [f.name, el("span", { class: "chip-x" }, "✕")]
          )
        );
      }
    }
    $("#logged-count").textContent = day.foods.length;

    // Same as yesterday
    const yesterday = STORAGE.getDay(shiftDay(ui.date, -1));
    const showSAY = day.foods.length === 0 && yesterday.foods.length > 0;
    const sayBtn = $("#same-as-yesterday");
    sayBtn.hidden = !showSAY;
    if (showSAY) {
      sayBtn.textContent = `Same as yesterday (${yesterday.foods.length})`;
    }

    // Frequent chips: top 12 from MRU minus already-logged
    const freqRoot = $("#frequent-chips");
    freqRoot.innerHTML = "";
    const loggedSet = new Set(day.foods);
    const freq = state.recentFoodIds.filter((id) => !loggedSet.has(id)).slice(0, 12);
    if (freq.length === 0) {
      freqRoot.appendChild(
        el("div", { class: "chip-empty" }, "Foods you log will appear here for quick access.")
      );
    } else {
      for (const id of freq) {
        const f = FOODS.resolve(id, state.customFoods);
        freqRoot.appendChild(
          el(
            "button",
            {
              class: "chip",
              onClick: () => {
                STORAGE.toggleFood(ui.date, id);
                renderToday();
              },
            },
            f.name
          )
        );
      }
    }

    // Food list
    renderFoodList(day, state);

    // Note
    $("#day-note").value = day.note || "";
  }

  function renderFoodList(day, state) {
    const list = $("#food-list");
    list.innerHTML = "";
    const loggedSet = new Set(day.foods);
    const q = ui.search.trim().toLowerCase();

    // Group built-in by category, then a "Custom" group at the end.
    const groups = FOODS.categories.map((c) => ({
      id: c.id,
      label: c.label,
      items: FOODS.all.filter((f) => f.category === c.id),
    }));
    if (state.customFoods.length > 0) {
      groups.push({ id: "custom", label: "Custom", items: state.customFoods });
    }

    for (const group of groups) {
      const filtered = q
        ? group.items.filter((f) => f.name.toLowerCase().includes(q))
        : group.items;
      if (filtered.length === 0) continue;

      const cat = el("div", { class: "food-cat" });
      const label = el("div", { class: "food-cat-label" }, group.label);
      label.style.setProperty("--cat-color", `var(--cat-${group.id})`);
      cat.appendChild(label);
      const row = el("div", { class: "chip-row" });
      for (const f of filtered) {
        const isSelected = loggedSet.has(f.id);
        row.appendChild(
          el(
            "button",
            {
              class: "chip" + (isSelected ? " selected" : ""),
              onClick: () => {
                STORAGE.toggleFood(ui.date, f.id);
                renderToday();
              },
            },
            f.name
          )
        );
      }
      cat.appendChild(row);
      list.appendChild(cat);
    }

    if (list.children.length === 0) {
      list.appendChild(
        el("div", { class: "chip-empty" }, q ? `No matches for "${q}".` : "No foods.")
      );
    }
  }

  // ---------- Calendar view ----------

  function renderCalendar() {
    const { year, month } = ui.calendar;
    const labelDate = new Date(year, month, 1);
    $("#calendar-label").textContent = labelDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const grid = $("#calendar-grid");
    grid.innerHTML = "";

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const tKey = todayKey();
    const days = STORAGE.getState().days;

    for (let i = 0; i < firstWeekday; i++) {
      grid.appendChild(el("div", { class: "cal-cell empty" }));
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dayRec = days[key];
      const cell = el(
        "button",
        {
          class: "cal-cell" + (key === tKey ? " today" : ""),
          onClick: () => {
            ui.date = key;
            setTab("today");
          },
        },
        [String(d)]
      );
      if (dayRec) {
        let cls = "cal-dot ";
        if (dayRec.symptom === "yes") cls += "dot-yes";
        else if (dayRec.symptom === "no") cls += "dot-no";
        else cls += "dot-unset";
        cell.appendChild(el("span", { class: cls }));
      }
      grid.appendChild(cell);
    }
  }

  // ---------- Insights view ----------

  function renderInsights() {
    const state = STORAGE.getState();
    const result = STATS.analyze(state.days, FOODS.all, state.customFoods);

    renderInsightsSummary(result);
    renderFoodsTable(result);
    renderCategoryTable(result);
    renderNeedsList(result);
  }

  function renderInsightsSummary(result) {
    const root = $("#insights-summary");
    root.innerHTML = "";

    const items = [
      ["Tracked", `${result.totalDays} ${result.totalDays === 1 ? "day" : "days"}`],
      ["Analyzed", `${result.analyzedDays} (${result.totalDays - result.analyzedDays} unflagged)`],
    ];
    if (result.analyzedDays > 0) {
      items.push([
        "Symptoms",
        `${result.symptomYes}/${result.analyzedDays} (${(result.baseline * 100).toFixed(0)}%)`,
      ]);
    }

    for (const [label, value] of items) {
      root.appendChild(
        el("span", { class: "stat" }, [
          el("span", { class: "stat-label" }, label),
          el("span", { class: "stat-value" }, value),
        ])
      );
    }

    if (result.recentBaseline !== null && result.analyzedDays > 0) {
      const delta = result.recentBaseline - result.baseline;
      const last30 = `${(result.recentBaseline * 100).toFixed(0)}%`;
      const valEl = el("span", { class: "stat-value" }, last30);
      if (Math.abs(delta) >= 0.02) {
        const dir = delta > 0 ? "up" : "down";
        const arrow = delta > 0 ? "▲" : "▼";
        valEl.appendChild(
          el(
            "span",
            { class: "delta " + dir },
            `${arrow}${(Math.abs(delta) * 100).toFixed(0)}pt`
          )
        );
      }
      root.appendChild(
        el("span", { class: "stat" }, [
          el("span", { class: "stat-label" }, "Last 30d"),
          valEl,
        ])
      );
    }
  }

  function renderFoodsTable(result) {
    const tbody = $("#foods-tbody");
    const empty = $("#foods-table-empty");
    const tableWrap = $("#foods-table").parentNode;
    tbody.innerHTML = "";

    const tested = result.rows.filter((r) => r.enough);
    if (tested.length === 0) {
      tableWrap.hidden = true;
      empty.hidden = false;
      empty.textContent =
        result.analyzedDays < STATS.MIN_EATEN + STATS.MIN_NOT_EATEN
          ? `Need at least ${STATS.MIN_EATEN + STATS.MIN_NOT_EATEN} days with the symptom flag set. Currently ${result.analyzedDays}.`
          : `No foods reach the ≥${STATS.MIN_EATEN}/≥${STATS.MIN_NOT_EATEN} sample threshold yet.`;
      return;
    }
    tableWrap.hidden = false;
    empty.hidden = true;

    tested.sort((a, b) => (b.rr ?? 0) - (a.rr ?? 0));

    for (const r of tested) {
      const cls =
        r.badge === "significant" ? "is-significant" :
        r.badge === "suggestive" ? "is-suggestive" : "";
      tbody.appendChild(
        el("tr", { class: cls }, [
          el("td", { class: "food-name" }, r.foodName),
          el("td", { class: "num" }, `${r.eaten}/${result.analyzedDays}`),
          el("td", { class: "num" }, pctOrDash(r.symptomRateEaten)),
          el("td", { class: "num" }, pctOrDash(r.symptomRateNotEaten)),
          el("td", { class: "num rr-cell" }, formatRR(r.rr)),
          el("td", { class: "num" }, formatQ(r.q)),
        ])
      );
    }
  }

  function renderCategoryTable(result) {
    const tbody = $("#category-tbody");
    tbody.innerHTML = "";

    // Group enough-data rows by category
    const byCat = {};
    for (const r of result.rows) {
      if (!r.enough || r.rr === null) continue;
      const cat = r.category || "Other";
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(r);
    }

    const cats = Object.keys(byCat).map((cat) => {
      const rows = byCat[cat];
      const rrs = rows.map((r) => r.rr).sort((a, b) => a - b);
      const median = rrs.length % 2 === 1
        ? rrs[(rrs.length - 1) / 2]
        : (rrs[rrs.length / 2 - 1] + rrs[rrs.length / 2]) / 2;
      const sig = rows.filter((r) => r.badge === "significant").length;
      return { cat, count: rows.length, median, sig };
    });

    if (cats.length === 0) {
      tbody.appendChild(
        el("tr", {}, el("td", { colspan: 4, class: "muted" }, "No category has tested foods yet."))
      );
      return;
    }

    cats.sort((a, b) => b.median - a.median);
    for (const c of cats) {
      tbody.appendChild(
        el("tr", {}, [
          el("td", {}, c.cat),
          el("td", { class: "num" }, String(c.count)),
          el("td", { class: "num rr-cell" }, formatRR(c.median)),
          el(
            "td",
            { class: "num" + (c.sig > 0 ? " sig is-significant" : " sig") },
            String(c.sig)
          ),
        ])
      );
    }
  }

  function renderNeedsList(result) {
    const root = $("#needs-list");
    root.innerHTML = "";
    // Only foods you've actually eaten at least once — anything you've never
    // touched is noise here.
    const needs = result.rows
      .filter((r) => !r.enough && r.eaten > 0)
      .sort((a, b) => b.eaten - a.eaten);

    if (needs.length === 0) {
      const li = el("li", { class: "muted" }, "Every food you've logged has enough samples — keep it up.");
      li.style.justifyContent = "flex-start";
      root.appendChild(li);
      return;
    }

    for (const r of needs) {
      root.appendChild(
        el("li", {}, [
          el("span", { class: "name" }, r.foodName),
          el("span", {}, `${r.eaten}/${r.notEaten}`),
        ])
      );
    }
  }

  function pctOrDash(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return `${(v * 100).toFixed(0)}%`;
  }

  function formatRR(rr) {
    if (rr === null || rr === undefined || Number.isNaN(rr)) return "—";
    if (rr >= 100) return rr.toFixed(0);
    return rr.toFixed(2);
  }

  function formatQ(q) {
    if (q === null || q === undefined || Number.isNaN(q)) return "—";
    if (q < 0.001) return "<.001";
    if (q < 0.01) return q.toFixed(3);
    return q.toFixed(2);
  }

  // ---------- Symptom FAB ----------

  function renderFab() {
    const day = STORAGE.getDay(ui.date);
    const state = day.symptom === null ? "unset" : day.symptom;
    const cluster = $("#fab-cluster");
    cluster.dataset.state = state;
    cluster.dataset.open = ui.fabOpen ? "true" : "false";

    const caption = state === "yes" ? "🤢" : state === "no" ? "🙂" : "?";
    $("#fab-caption").textContent = caption;

    const backdrop = $("#fab-backdrop");
    backdrop.hidden = !ui.fabOpen;
    backdrop.dataset.show = ui.fabOpen ? "true" : "false";
  }

  function setFabOpen(open) {
    ui.fabOpen = !!open;
    renderFab();
  }

  // ---------- Wiring ----------

  function wire() {
    // Tab bar
    $$(".tab").forEach((b) => {
      b.addEventListener("click", () => setTab(b.dataset.tab));
    });

    // Day nav / actions (delegated)
    document.addEventListener("click", (e) => {
      const t = e.target.closest && e.target.closest("[data-action]");
      if (!t) return;
      const action = t.dataset.action;
      if (action === "prev-day") {
        ui.date = shiftDay(ui.date, -1);
        renderToday();
        renderFab();
      } else if (action === "next-day") {
        ui.date = shiftDay(ui.date, 1);
        renderToday();
        renderFab();
      } else if (action === "open-date-picker") {
        const input = $("#day-date-input");
        if (input.showPicker) {
          try { input.showPicker(); } catch (_) { input.focus(); input.click(); }
        } else {
          input.focus();
          input.click();
        }
      } else if (action === "prev-month") {
        ui.calendar.month--;
        if (ui.calendar.month < 0) {
          ui.calendar.month = 11;
          ui.calendar.year--;
        }
        renderCalendar();
      } else if (action === "next-month") {
        ui.calendar.month++;
        if (ui.calendar.month > 11) {
          ui.calendar.month = 0;
          ui.calendar.year++;
        }
        renderCalendar();
      } else if (action === "export") {
        STORAGE.exportJson();
        $("#export-status").textContent = "Exported.";
      } else if (action === "import") {
        $("#import-file").click();
      } else if (action === "reset") {
        if (confirm("Erase ALL tracked data? This cannot be undone.")) {
          STORAGE.reset();
          ui.date = todayKey();
          $("#menu-sheet").close();
          setTab("today");
        }
      } else if (action === "close-menu") {
        $("#menu-sheet").close();
      }
    });

    // Date input
    $("#day-date-input").addEventListener("change", (e) => {
      if (e.target.value) {
        ui.date = e.target.value;
        renderToday();
        renderFab();
      }
    });

    // Same as yesterday
    $("#same-as-yesterday").addEventListener("click", () => {
      const y = STORAGE.getDay(shiftDay(ui.date, -1));
      if (y.foods.length === 0) return;
      const today = STORAGE.getDay(ui.date);
      const merged = today.foods.slice();
      for (const id of y.foods) {
        if (merged.indexOf(id) === -1) merged.push(id);
      }
      STORAGE.setDay(ui.date, { foods: merged });
      renderToday();
    });

    // Search
    let searchTimer = null;
    $("#food-search").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      const v = e.target.value;
      searchTimer = setTimeout(() => {
        ui.search = v;
        renderFoodList(STORAGE.getDay(ui.date), STORAGE.getState());
      }, 100);
    });

    // Custom food
    $("#add-custom-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#add-custom-input");
      const name = input.value;
      const entry = STORAGE.addCustomFood(name);
      if (entry) {
        STORAGE.toggleFood(ui.date, entry.id);
        input.value = "";
        renderToday();
      }
    });

    // Note
    let noteTimer = null;
    $("#day-note").addEventListener("input", (e) => {
      clearTimeout(noteTimer);
      const v = e.target.value;
      noteTimer = setTimeout(() => {
        STORAGE.setNote(ui.date, v);
      }, 250);
    });

    // Import file
    $("#import-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const mode = confirm(
        "OK = MERGE imported data with existing days (incoming wins on conflict).\nCancel = REPLACE all data with the imported file."
      )
        ? "merge"
        : "replace";
      try {
        STORAGE.importJson(text, mode);
        ui.date = todayKey();
        $("#menu-sheet").close();
        setTab("today");
        $("#export-status").textContent = `Imported (${mode}).`;
      } catch (err) {
        alert("Import failed: " + err.message);
      }
      e.target.value = "";
    });

    // FAB main button — pointer events drive both tap and drag-to-select
    wireFabPointer();

    // FAB option buttons (tap-to-select fallback when no drag)
    $$(".fab-option").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        commitSymptom(opt.dataset.symptom === "null" ? null : opt.dataset.symptom);
      });
    });

    // FAB backdrop closes
    $("#fab-backdrop").addEventListener("click", () => setFabOpen(false));

    // Esc closes FAB and menu
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (ui.fabOpen) setFabOpen(false);
      }
    });

    // Hash routing: respond to back/forward and manual hash edits
    window.addEventListener("hashchange", () => {
      const tab = tabFromHash();
      if (tab !== ui.tab) setTab(tab, { fromHash: true });
    });
  }

  function commitSymptom(value) {
    STORAGE.setSymptom(ui.date, value);
    setFabOpen(false);
    if (ui.tab === "calendar") renderCalendar();
    else if (ui.tab === "insights") renderInsights();
  }

  function wireFabPointer() {
    const fabMain = $("#fab-main");
    let drag = null;
    const MOVE_THRESHOLD = 8; // px; below this, treat as a tap
    const ARM_THRESHOLD = 60; // px; pointer within this of an option center → armed

    function clearArmed() {
      $$(".fab-option").forEach((o) => o.classList.remove("armed"));
    }

    function armedFromPointer(clientX, clientY) {
      let best = null;
      let bestDist = Infinity;
      for (const opt of $$(".fab-option")) {
        const r = opt.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(clientX - cx, clientY - cy);
        if (d < bestDist) { bestDist = d; best = opt; }
      }
      return bestDist <= ARM_THRESHOLD ? best : null;
    }

    fabMain.addEventListener("pointerdown", (e) => {
      // Don't preventDefault on synthetic mouse from a previous touch — but for
      // primary touch/mouse, preventDefault keeps the page from selecting text
      // or rubber-banding while dragging.
      e.preventDefault();
      try { fabMain.setPointerCapture(e.pointerId); } catch (_) {}
      drag = {
        pointerId: e.pointerId,
        wasOpen: ui.fabOpen,
        startX: e.clientX,
        startY: e.clientY,
        armed: null,
        hadMove: false,
      };
      if (!ui.fabOpen) setFabOpen(true);
    });

    fabMain.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.hadMove) {
        const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
        if (moved > MOVE_THRESHOLD) drag.hadMove = true;
      }
      if (!drag.hadMove) return;

      const armedEl = armedFromPointer(e.clientX, e.clientY);
      if (drag.armed !== armedEl) {
        clearArmed();
        if (armedEl) armedEl.classList.add("armed");
        drag.armed = armedEl;
      }
    });

    function endDrag(e, cancelled) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      try { fabMain.releasePointerCapture(e.pointerId); } catch (_) {}
      const { armed, hadMove, wasOpen } = drag;
      drag = null;
      clearArmed();

      if (cancelled) {
        setFabOpen(false);
        return;
      }
      if (armed) {
        commitSymptom(
          armed.dataset.symptom === "null" ? null : armed.dataset.symptom
        );
      } else if (hadMove) {
        // dragged but not over an option — close
        setFabOpen(false);
      } else if (wasOpen) {
        // pure tap on an already-open FAB — close
        setFabOpen(false);
      }
      // else: tap from closed → menu now open, wait for option tap
    }

    fabMain.addEventListener("pointerup", (e) => endDrag(e, false));
    fabMain.addEventListener("pointercancel", (e) => endDrag(e, true));
  }

  // ---------- Boot ----------

  function boot() {
    wire();
    setTab(tabFromHash());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
