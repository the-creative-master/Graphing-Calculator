/**
 * Minimal test harness — no dependencies, run with: npm test
 *
 * Supports sync and async test bodies:
 *
 *   test('works', () => { ... });
 *   test('works async', async () => { ... });
 *   await summary('suite name');   // awaits everything, sets the exit code
 */
import assert from 'node:assert/strict';

let passed = 0;
const failures = [];
const pending = [];

export function test(name, fn) {
  const record = (error) => {
    if (error) {
      failures.push({ name, error });
      console.log(`  ✗ ${name}\n      ${String(error.message ?? error).split('\n').join('\n      ')}`);
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  };

  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      const tracked = result.then(() => record(null), record);
      pending.push(tracked);
      return tracked;
    }
    record(null);
  } catch (error) {
    record(error);
  }
  return undefined;
}

export async function summary(label) {
  await Promise.all(pending);
  console.log(`\n${label}: ${passed} passed, ${failures.length} failed\n`);
  if (failures.length) process.exitCode = 1;
}

export { assert };
