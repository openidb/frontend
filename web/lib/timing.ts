/**
 * Start a timer and return a function that returns elapsed ms when called
 */
export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
