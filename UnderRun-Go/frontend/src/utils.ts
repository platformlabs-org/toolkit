export function fmtTime(ts?: string) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function cls(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}
