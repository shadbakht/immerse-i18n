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
  tr: 'Türkçe',
  fa: 'فارسی',
  ar: 'العربية',
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code;
}

/**
 * Interface languages. Unlike content packs these ship inside the app — the
 * translation tables are kilobytes — so this list is static and always
 * complete. Keep it in step with the locale tables in index.ts.
 */
export const UI_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: LANGUAGE_LABELS.en },
  { code: 'es', label: LANGUAGE_LABELS.es },
];
