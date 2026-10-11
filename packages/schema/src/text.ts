/** Normalizes text for verbatim comparisons: unicode NFC, collapsed whitespace, unified quotes/dashes. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ")
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercased, punctuation-light key for fuzzy containment checks. */
export function textKey(input: string): string {
  return normalizeText(input).toLowerCase();
}
