// Minimal cross-runtime test harness — works in Bun, Node, and Deno.
// No dependencies. Tests register themselves into a module-level array;
// run-tests.mjs imports each test file (which triggers registration),
// then calls runAll().

const tests = [];
let currentSuite = "";

export function suite(name) {
  currentSuite = name;
}

export function test(name, fn) {
  tests.push({ suite: currentSuite, name, fn });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      `${msg || "assertEqual"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

export function assertClose(actual, expected, eps = 1e-6, msg) {
  if (typeof actual !== "number" || Math.abs(actual - expected) > eps) {
    throw new Error(
      `${msg || "assertClose"}: expected ~${expected} (eps=${eps}), got ${actual}`
    );
  }
}

export async function runAll() {
  let passed = 0;
  let failed = 0;
  let lastSuite = null;
  for (const t of tests) {
    if (t.suite !== lastSuite) {
      console.log(`\n${t.suite || "(root)"}`);
      lastSuite = t.suite;
    }
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${t.name}`);
      const lines = String(e.stack || e.message || e).split("\n");
      for (const line of lines.slice(0, 3)) console.log(`      ${line}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (typeof process !== "undefined" && typeof process.exit === "function") {
    process.exit(failed > 0 ? 1 : 0);
  } else if (typeof Deno !== "undefined") {
    Deno.exit(failed > 0 ? 1 : 0);
  }
}
