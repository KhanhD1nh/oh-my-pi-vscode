/** `a > b` for dotted numeric versions ("0.19.0", "v1.2.3"); missing parts count as 0. */
export function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/u, '').split('.').map(Number), pb = b.replace(/^v/u, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}
