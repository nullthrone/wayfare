/** Wrapper so server pages can compare against "now" without calling Date.now() in render code. */
export function nowMs(): number {
  return Date.now();
}
