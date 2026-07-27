/**
 * Language identity — which languages exist and what to call them.
 *
 * Shared because both apps had their own copy: the mobile LanguageContext and
 * the web LibraryPanel each declared a LANGUAGE_LABELS map, and they had
 * already drifted (web was missing tr/fa/ar).
 */

/**
 * Display names for content languages, keyed by BCP-47 tag. Each name is
 * written in its own language — a Spanish speaker looks for "Español", not
 * "Spanish". Covers more than the UI supports: a content pack can exist in a
 * language the interface has not been translated into yet.
 */
export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  ru: 'Русский',
  // Simplified, the script the `zh` tables are written in. Marked as such
  // because a reader who wants Traditional has to be able to tell at a glance
  // that this is not it.
  zh: '中文（简体）',
  tr: 'Türkçe',
  fa: 'فارسی',
  ar: 'العربية',
  he: 'עברית',
  ur: 'اردو',
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code;
}

/**
 * Languages written right-to-left.
 *
 * Kept here, next to the labels, so the two apps cannot disagree about which
 * languages need mirroring — the same drift that made LANGUAGE_LABELS shared.
 * Broader than the UI currently offers: a *content* pack can be RTL before the
 * interface is translated, and the reader has to mirror for it either way.
 */
export const RTL_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'fa', 'he', 'ur']);

/**
 * Whether a locale is right-to-left.
 *
 * Matches on the primary subtag, so regional variants (`ar-EG`, `fa-AF`) are
 * recognised rather than silently treated as left-to-right.
 */
export function isRTL(code: string | null | undefined): boolean {
  if (!code) return false;
  return RTL_LANGUAGES.has(code.split('-')[0].toLowerCase());
}

/** `'rtl'` or `'ltr'` — the value for an HTML `dir` attribute. */
export function directionOf(code: string | null | undefined): 'rtl' | 'ltr' {
  return isRTL(code) ? 'rtl' : 'ltr';
}

/**
 * Interface languages. Unlike content packs these ship inside the app — the
 * translation tables are kilobytes — so this list is static and always
 * complete. Keep it in step with the locale tables in index.ts.
 */
export const UI_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: LANGUAGE_LABELS.en },
  { code: 'es', label: LANGUAGE_LABELS.es },
  { code: 'fr', label: LANGUAGE_LABELS.fr },
  { code: 'ru', label: LANGUAGE_LABELS.ru },
  { code: 'zh', label: LANGUAGE_LABELS.zh },
  { code: 'tr', label: LANGUAGE_LABELS.tr },
  // The first right-to-left interface language. Adding it needed no app code —
  // both platforms already mirror from `isRTL` — but it does need the reader to
  // declare each book's own direction, or a Persian interface renders every
  // left-to-right book right-to-left.
  { code: 'fa', label: LANGUAGE_LABELS.fa },
];
