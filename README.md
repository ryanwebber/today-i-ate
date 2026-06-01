# Today I Ate

A personal-use, single-page food + symptom tracker for chasing down food
sensitivities. Built with vanilla HTML/CSS/JS and localstorage.

## How the stats work

For each food with at least 5 symptom-flagged days where you ate it AND
at least 5 where you didn't, the analysis builds a 2×2 contingency table:

|              | Symptoms | No symptoms |
|--------------|----------|-------------|
| Ate food     | a        | b           |
| Didn't eat   | c        | d           |

Then computes:
- **Risk ratio** = `(a / (a+b)) / (c / (c+d))` — relative likelihood of
  symptoms after eating the food. Haldane–Anscombe corrected when a cell
  is zero.
- **Fisher's exact test** (two-sided) for a p-value. Works correctly with
  small samples — chi-square doesn't.
- **Benjamini–Hochberg adjusted q-values** across all tested foods, so
  you don't see ~5 false positives by chance just because ~100 foods are
  tested. Rows with `q ≤ 0.10` are highlighted as significant.

**Caveats baked into the analysis:**
- Same-day correlation only. Food eaten on Monday isn't credited to
  Tuesday's symptoms. Many digestive triggers act on a 24–48 h lag, so
  treat the results as a starting point, not a verdict.
- Foods you eat together get correlated signals (confounding). The seed
  data deliberately includes onion-following-garlic to demonstrate this.
- Correlation isn't causation. The right way to confirm a hit from this
  table is to eliminate the suspect food for two weeks and reintroduce.

## Deploying a new version

The app uses a Service Worker (`sw.js`) for cache control on iOS PWA
installs. To force a reload across all installed instances:

1. Bump `CACHE_NAME` in `sw.js` (e.g. `tia-v1` → `tia-v2`).
2. Bump `APP_VERSION` at the top of `js/app.js` to match (e.g. `v1` → `v2`).
   This is the string shown in the menu sheet's footer so you can verify
   which build is live on your home-screen PWA.
3. Push to your host (GitHub Pages, etc.).
4. iOS PWAs auto-reload on next launch or focus — usually within seconds
   of opening, no need to delete and reinstall.

If you add or remove top-level files, also update the `PRECACHE` list in
`sw.js` so the new file is part of the offline bundle.

## Tests

```sh
bun tests/run-tests.mjs
# or: node tests/run-tests.mjs
```

Runs ~50 tests against the food list, statistics engine, storage layer,
and a synthetic 70-day dataset. The test fixture (`tests/test-import.json`)
auto-generates on first run.
