/**
 * Minimal test harness — no dependencies, run with: npm test
 *
 * Tests are declared with `test(name, fn)` and run **sequentially, in
 * declaration order** when `await summary(label)` is called. Sequential
 * execution matters for the UI suites: each test drives the same DOM.
 *
 *   test('works', () => { ... });
 *   test('works async', async () => { ... });
 *   await summary('suite name');   // runs everything, sets the exit code
 */
import assert from 'node:assert/strict';

const queue = [];
let passed = 0;
const failures = [];

export function test(name, fn) {
  queue.push({ name, fn });
}

export async function summary(label) {
  for (const { name, fn } of queue.splice(0)) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failures.push({ name, error });
      console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split('\n').join('\n      ')}`);
    }
  }

  console.log(`\n${label}: ${passed} passed, ${failures.length} failed\n`);
  if (failures.length) process.exitCode = 1;
}

export { assert };
