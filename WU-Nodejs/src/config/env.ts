export function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const v of values) {
    if (v && String(v).trim()) return String(v);
  }
  return null;
}
