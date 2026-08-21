/**
 * Dotted-numeric version comparison.
 *
 * Lives here rather than in the mobile app because it is pure logic with no
 * platform dependency — which also means it can be tested without pulling in
 * React Native, and the web app can use it if it ever needs to.
 */
export function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const b = current.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}
