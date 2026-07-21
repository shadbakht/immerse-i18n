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
 * in sync — a bug class this avoids entirely. Spanish shares English's
 * one/other plural rule, so the extra machinery i18next provides buys nothing
 * here. Revisit if a locale with richer plural rules (Arabic, Russian, Polish)
 * is ever added.
 *
 * Lookup order: requested locale → English → the key itself. A missing
 * translation therefore degrades to English rather than showing a raw key.
 */

import { en, type RawTranslationKey } from './en';
import { es } from './es';

export { LANGUAGE_LABELS, UI_LANGUAGES, languageLabel } from './languages';

/**
 * The base name behind a plural pair: `common.book_one` → `common.book`.
 *
 * Callers write `t('common.book', { count })` and let translate() pick the
 * variant, so the base has to be a valid key even though no table contains it
 * directly. Without this the type would reject every real plural call site.
 */
type PluralBaseKey<K extends string> =
  K extends `${infer Base}_one` ? Base :
  K extends `${infer Base}_other` ? Base :
  never;

export type TranslationKey = RawTranslationKey | PluralBaseKey<RawTranslationKey>;

const LOCALES: Record<string, Partial<Record<RawTranslationKey, string>>> = { en, es };

export const SUPPORTED_UI_LANGUAGES = Object.keys(LOCALES);

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
 */
export function translate(
  locale: string,
  key: TranslationKey,
  vars?: TranslateVars,
): string {
  const chain = [LOCALES[locale], LOCALES.en];

  if (vars?.count !== undefined) {
    const variant = `${key}${vars.count === 1 ? '_one' : '_other'}` as RawTranslationKey;
    for (const table of chain) {
      const hit = table?.[variant];
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
