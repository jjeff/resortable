/** Simple performance measurement utilities */

export function measure<T>(
  label: string,
  fn: () => T
): { result: T; duration: number; label: string } {
  const start = globalThis.performance.now()
  const result = fn()
  const duration = globalThis.performance.now() - start
  return { result, duration, label }
}
