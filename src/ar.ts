import type { LocaleTable } from './keys';

/**
 * Arabic (Modern Standard) UI strings.
 *
 * Partial by design: any key omitted here falls back to English rather than
 * rendering a raw key.
 *
 * Plural groups carry the full set of CLDR categories Arabic distinguishes —
 * `_zero` (0), `_one` (1), `_two` (2), `_few` (3–10), `_many` (11–99),
 * `_other` (everything else). A noun takes a different form in each, so unlike
 * Persian the `_other`-only shortcut would read as broken Arabic on "2 books"
 * or "3 books".
 *
 * Digits are left as the Latin ones the interpolated `{{count}}` produces
 * rather than being rewritten as Arabic-Indic numerals, so a counted string
 * never mixes two numeral systems in one sentence — matching fa.ts.
 */
export const ar: LocaleTable = {
};
