const DigitsOnlyRegex = /\D+/g;

export function tryParseSubmissionShortcut(input: string) {
  if (!input || !input.trim()) return { ok: false as const };

  const s = input.trim();
  const tokens = s.split("_").map(t => t.trim()).filter(Boolean);
  if (tokens.length >= 3) {
    const productId = tokens[1];
    const submissionId = tokens[2];
    if (productId && submissionId) return { ok: true as const, productId, submissionId };
  }

  const digits = s.replace(DigitsOnlyRegex, "");
  if (digits.length < 19) return { ok: false as const };

  const submissionId = digits.slice(-19);
  const remain = digits.slice(0, -19);
  if (remain.length >= 17) {
    const productId = remain.slice(-17);
    return { ok: true as const, productId, submissionId };
  }

  return { ok: false as const };
}
