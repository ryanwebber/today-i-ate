// Statistical analysis for today-i-ate.
// Per-food: 2x2 contingency table -> Fisher's exact test (two-sided)
//   + risk ratio + Benjamini-Hochberg q-values across all tested foods.
//
// Definitions:
//   For each food F and the set of days where symptom is logged (yes/no):
//     a = days(eaten F AND symptom=yes)
//     b = days(eaten F AND symptom=no)
//     c = days(NOT eaten F AND symptom=yes)
//     d = days(NOT eaten F AND symptom=no)
//   Risk ratio = (a/(a+b)) / (c/(c+d))    [Haldane +0.5 if c == 0]
//
// Days with symptom=null are excluded from analysis entirely.

window.STATS = (function () {
  const MIN_EATEN = 5;
  const MIN_NOT_EATEN = 5;
  const SIG_Q = 0.10;
  const SUGGESTIVE_P = 0.05;

  // Memoized log-factorial.
  const _logFactCache = [0, 0];
  function logFact(n) {
    if (n < _logFactCache.length) return _logFactCache[n];
    let v = _logFactCache[_logFactCache.length - 1];
    for (let i = _logFactCache.length; i <= n; i++) {
      v += Math.log(i);
      _logFactCache[i] = v;
    }
    return v;
  }

  // log P(X = k | r1, c1, n) under hypergeometric with fixed marginals.
  function logHypergeom(k, r1, c1, n) {
    const r2 = n - r1;
    const c2 = n - c1;
    if (k < 0 || k > r1 || k > c1 || c2 - r1 + k < 0) return -Infinity;
    return (
      logFact(c1) +
      logFact(c2) +
      logFact(r1) +
      logFact(r2) -
      logFact(n) -
      logFact(k) -
      logFact(c1 - k) -
      logFact(r1 - k) -
      logFact(c2 - r1 + k)
    );
  }

  // Two-sided Fisher's exact test on a 2x2 table.
  // Returns p-value in [0, 1].
  function fishersExact(a, b, c, d) {
    const r1 = a + b;
    const r2 = c + d;
    const c1 = a + c;
    const c2 = b + d;
    const n = r1 + r2;
    if (r1 === 0 || r2 === 0 || c1 === 0 || c2 === 0) return 1;

    const logPobs = logHypergeom(a, r1, c1, n);
    const minK = Math.max(0, r1 - c2);
    const maxK = Math.min(c1, r1);

    // Sum P(table) over all tables with P <= P(observed).
    // Work in log-space then exponentiate against the max for numerical stability.
    const logProbs = [];
    for (let k = minK; k <= maxK; k++) {
      const lp = logHypergeom(k, r1, c1, n);
      // 1e-12 tolerance keeps the observed table itself in the sum despite FP noise
      if (lp <= logPobs + 1e-12) logProbs.push(lp);
    }
    if (logProbs.length === 0) return 1;
    const maxLp = Math.max.apply(null, logProbs);
    let sum = 0;
    for (const lp of logProbs) sum += Math.exp(lp - maxLp);
    const p = Math.exp(maxLp) * sum;
    return Math.min(1, Math.max(0, p));
  }

  function riskRatio(a, b, c, d) {
    const r1 = a + b;
    const r2 = c + d;
    if (r1 === 0 || r2 === 0) return null;
    if (c === 0) {
      // Haldane–Anscombe correction for zero cell
      return ((a + 0.5) / (r1 + 1)) / ((c + 0.5) / (r2 + 1));
    }
    return (a / r1) / (c / r2);
  }

  // Benjamini-Hochberg adjusted p-values (q-values).
  // Input: array of raw p-values. Output: array of q-values, same order.
  function benjaminiHochberg(pValues) {
    const n = pValues.length;
    if (n === 0) return [];
    const indexed = pValues.map((p, i) => ({ p, i }));
    indexed.sort((x, y) => x.p - y.p);
    const adjusted = new Array(n);
    let prev = 1;
    for (let rank = n; rank >= 1; rank--) {
      const entry = indexed[rank - 1];
      const adj = Math.min(prev, (entry.p * n) / rank);
      adjusted[entry.i] = adj;
      prev = adj;
    }
    return adjusted;
  }

  // Build per-food rows from the days map.
  // `days`: { "YYYY-MM-DD": { foods: [...], symptom: "yes"|"no"|null, note } }
  // `foods`: full FOODS.all list (built-in)
  // `customFoods`: array from STATE.customFoods
  // Returns { rows, baseline, totalDays, analyzedDays, lookup }
  function analyze(days, foods, customFoods) {
    const allFoods = foods.concat(customFoods || []);

    // Restrict to days with a non-null symptom.
    const analyzed = [];
    for (const key in days) {
      const d = days[key];
      if (d && (d.symptom === "yes" || d.symptom === "no")) {
        analyzed.push(d);
      }
    }
    const totalDays = Object.keys(days).length;
    const N = analyzed.length;
    const symptomYes = analyzed.filter((d) => d.symptom === "yes").length;
    const baseline = N > 0 ? symptomYes / N : 0;

    // Last-30-days baseline
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    let recent = 0;
    let recentSymptom = 0;
    for (const key in days) {
      if (key >= cutoffKey) {
        const d = days[key];
        if (d && (d.symptom === "yes" || d.symptom === "no")) {
          recent++;
          if (d.symptom === "yes") recentSymptom++;
        }
      }
    }
    const recentBaseline = recent > 0 ? recentSymptom / recent : null;

    const rawRows = [];
    for (const food of allFoods) {
      let a = 0, b = 0, c = 0, d = 0;
      for (const day of analyzed) {
        const ate = day.foods.indexOf(food.id) !== -1;
        // Wildcard exclusion: when the user marked a meal as "unknown" and
        // this specific food isn't logged, we can't tell whether it was
        // truly absent or hidden inside the unknown meal — so we drop the
        // day from this food's table. Doesn't apply when analyzing the
        // "unknown" token itself.
        if (food.id !== "unknown" && !ate && day.foods.indexOf("unknown") !== -1) {
          continue;
        }
        const sym = day.symptom === "yes";
        if (ate && sym) a++;
        else if (ate && !sym) b++;
        else if (!ate && sym) c++;
        else d++;
      }
      const eaten = a + b;
      const notEaten = c + d;
      const enough = eaten >= MIN_EATEN && notEaten >= MIN_NOT_EATEN;
      const rr = enough ? riskRatio(a, b, c, d) : null;
      const p = enough ? fishersExact(a, b, c, d) : null;
      rawRows.push({
        foodId: food.id,
        foodName: food.name,
        category: food.categoryLabel || food.category,
        a, b, c, d,
        eaten,
        notEaten,
        symptomRateEaten: eaten > 0 ? a / eaten : null,
        symptomRateNotEaten: notEaten > 0 ? c / notEaten : null,
        rr,
        p,
        q: null, // filled in below
        enough,
      });
    }

    // BH correction across rows that had enough data
    const tested = rawRows.filter((r) => r.enough);
    const ps = tested.map((r) => r.p);
    const qs = benjaminiHochberg(ps);
    tested.forEach((r, i) => {
      r.q = qs[i];
    });

    for (const r of rawRows) {
      r.badge = badgeFor(r);
    }

    return {
      rows: rawRows,
      baseline,
      recentBaseline,
      totalDays,
      analyzedDays: N,
      symptomYes,
    };
  }

  function badgeFor(row) {
    if (!row.enough) return "needs-data";
    if (row.q !== null && row.q <= SIG_Q) return "significant";
    if (row.p !== null && row.p <= SUGGESTIVE_P) return "suggestive";
    return "no-signal";
  }

  return {
    analyze,
    fishersExact,
    riskRatio,
    benjaminiHochberg,
    MIN_EATEN,
    MIN_NOT_EATEN,
    SIG_Q,
    SUGGESTIVE_P,
  };
})();
