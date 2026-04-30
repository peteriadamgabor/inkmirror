/**
 * Localized field accessor with fallback chain:
 *   1. exact match on the requested locale
 *   2. English (the operator's source-of-truth locale)
 *   3. first available locale key
 *   4. empty string (the announcement is malformed; surface nothing)
 */
export function pickLocalized(
  field: Partial<Record<string, string>>,
  lang: string,
): string {
  const direct = field[lang];
  if (typeof direct === 'string' && direct.length > 0) return direct;
  const en = field.en;
  if (typeof en === 'string' && en.length > 0) return en;
  for (const value of Object.values(field)) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}
