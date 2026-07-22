/**
 * Minimal i18n layer, shared by the Immerse mobile app and immerse-web.
 *
 * This package is the single source of the UI strings for both platforms, so
 * a term only ever gets translated once — "Remisiones" for cross-references,
 * "Etiquetas" for tags — instead of drifting between two hand-kept copies.
 * It holds no platform code: consumers own their own language state and pass
 * a locale in.
 *
 * Deliberately not i18next. Each consumer already owns `uiLanguage`, and a
 * library with its own language state would mean two sources of truth to keep
 * in sync — a bug class this avoids entirely. Plural selection, the one piece
 * of real i18n machinery needed, comes from the platform's own `Intl` rather
 * than from a dependency.
 *
 * Lookup order: requested locale → English → the key itself. A missing
 * translation therefore degrades to English rather than showing a raw key.
 */

import { en, type RawTranslationKey } from './en';
import { es } from './es';

export { LANGUAGE_LABELS, UI_LANGUAGES, languageLabel } from './languages';

/**
 * The base name behind a plural group: `common.book_one` → `common.book`.
 *
 * Callers write `t('common.book', { count })` and let translate() pick the
 * variant, so the base has to be a valid key even though no table contains it
 * directly. Without this the type would reject every real plural call site.
 *
 * All six CLDR categories are listed, not just the two English needs, so a
 * locale that uses `_few` or `_many` types correctly the day it is added.
 */
type PluralBaseKey<K extends string> =
  K extends `${infer Base}_zero` ? Base :
  K extends `${infer Base}_one` ? Base :
  K extends `${infer Base}_two` ? Base :
  K extends `${infer Base}_few` ? Base :
  K extends `${infer Base}_many` ? Base :
  K extends `${infer Base}_other` ? Base :
  never;

export type TranslationKey = RawTranslationKey | PluralBaseKey<RawTranslationKey>;

/**
 * Every registered locale table. Exported so the tests can hold all of them to
 * the same guarantees generically — the parity checks used to name `es`, which
 * silently left any third locale unguarded.
 */
export const LOCALES: Record<string, Partial<Record<RawTranslationKey, string>>> = { en, es };

export const SUPPORTED_UI_LANGUAGES = Object.keys(LOCALES);

/**
 * CLDR plural category for a count, e.g. 3 in Arabic → 'few'.
 *
 * English and Spanish need only one/other, but Arabic has six categories and
 * Polish and Russian three, so hardcoding `count === 1 ? one : other` renders
 * quietly wrong text rather than failing. `Intl.PluralRules` knows every
 * locale's rules and ships with both runtimes, so this costs no dependency.
 *
 * Feature-detected: if a JS engine lacks Intl.PluralRules, or does not know the
 * locale, fall back to the English-style rule rather than throwing. Hermes in
 * particular can be built without full Intl.
 */
const pluralRulesCache = new Map<string, Intl.PluralRules | null>();

function pluralCategory(locale: string, count: number): string {
  if (!pluralRulesCache.has(locale)) {
    let rules: Intl.PluralRules | null = null;
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'function') {
        rules = new Intl.PluralRules(locale);
      }
    } catch {
      rules = null;                       // unknown locale tag
    }
    pluralRulesCache.set(locale, rules);
  }
  const rules = pluralRulesCache.get(locale);
  if (!rules) return count === 1 ? 'one' : 'other';
  try {
    return rules.select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

export interface TranslateVars {
  /** Selects the `_one` / `_other` variant, and is interpolated as {{count}}. */
  count?: number;
  [key: string]: string | number | undefined;
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Resolve a key for a locale.
 *
 * When `count` is supplied the plural variants are tried first, so
 * `t('common.book', { count: 1 })` finds `common.book_one`. A key with no
 * plural variants still resolves normally, which keeps counted and uncounted
 * strings interchangeable.
 *
 * Plural resolution tries the locale's own CLDR category first, then that
 * locale's `_other`, and only then the same pair in English. The middle step
 * matters: a translator who supplies just `_one`/`_other` for a language that
 * technically has more categories still gets their own language's words rather
 * than dropping through to English.
 */
export function translate(
  locale: string,
  key: TranslationKey,
  vars?: TranslateVars,
): string {
  const chain = [LOCALES[locale], LOCALES.en];

  if (vars?.count !== undefined) {
    const category = pluralCategory(locale, vars.count);
    for (const table of chain) {
      if (!table) continue;
      const hit = table[`${key}_${category}` as RawTranslationKey]
               ?? table[`${key}_other` as RawTranslationKey];
      if (hit) return interpolate(hit, vars);
    }
  }

  // A base plural key has no direct entry, so this lookup simply misses and
  // falls through — the variant loop above is what resolves it.
  for (const table of chain) {
    const hit = table?.[key as RawTranslationKey];
    if (hit) return interpolate(hit, vars);
  }

  // `__DEV__` is React Native-only; this package is also consumed by Next, so
  // the dev check has to be one both bundlers define.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] missing key: ${key}`);
  }
  return key;
}
