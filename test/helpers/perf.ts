/**
 * Performance timer utilities for test measurement.
 *
 * Provides startTimer() for elapsed-time capture and formatMs()
 * for human-readable display. Uses performance.now() for sub-ms
 * precision.
 */

/**
 * Start a high-resolution timer. Returns a function that, when called,
 * returns the elapsed time in milliseconds.
 *
 * @example
 * const elapsed = startTimer();
 * await someOperation();
 * console.log(`Took ${formatMs(elapsed())}`);
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}

/**
 * Format a millisecond value for display.
 * - Under 1000ms: "123ms"
 * - 1000ms+: "1.23s"
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Run a function N times and return timing statistics.
 */
export async function benchmark(
  fn: () => Promise<void>,
  iterations: number
): Promise<{ min: number; max: number; p50: number; mean: number; times: number[] }> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const elapsed = startTimer();
    await fn();
    times.push(elapsed());
  }

  times.sort((a, b) => a - b);
  const p50Index = Math.floor(times.length / 2);

  return {
    min: times[0],
    max: times[times.length - 1],
    p50: times[p50Index],
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    times,
  };
}
