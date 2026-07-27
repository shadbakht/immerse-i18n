/**
 * The key types, shared by index.ts and by every locale table.
 *
 * They live apart from both because the locale tables need them and index.ts
 * imports the locale tables — declaring them in index.ts would make each table
 * import its own importer.
 */

import type { RawTranslationKey } from './en';

/**
 * The six CLDR plural categories. Most languages use two of them; Russian uses
 * four, Arabic all six.
 */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * The base name behind a plural group: `common.book_one` → `common.book`.
 *
 * Callers write `t('common.book', { count })` and let translate() pick the
 * variant, so the base has to be a valid key even though no table contains it
 * directly. Without this the type would reject every real plural call site.
 *
 * All six categories are listed, not just the two English needs, so a locale
 * that uses `_few` or `_many` types correctly the day it is added.
 */
export type PluralBaseKey<K extends string> =
  K extends `${infer Base}_zero` ? Base :
  K extends `${infer Base}_one` ? Base :
  K extends `${infer Base}_two` ? Base :
  K extends `${infer Base}_few` ? Base :
  K extends `${infer Base}_many` ? Base :
  K extends `${infer Base}_other` ? Base :
  never;

/** What a caller may ask for: any English key, or a plural group's base. */
export type TranslationKey = RawTranslationKey | PluralBaseKey<RawTranslationKey>;

/**
 * What a locale table may *hold*, which is wider than what English writes:
 * every English key, plus any CLDR category of a plural group English defines.
 *
 * Russian says «1 книга / 3 книги / 5 книг» where English manages with two
 * forms, so `common.book_few` and `common.book_many` have to be expressible.
 * They are not orphan keys — they are the same group, counted the way that
 * language counts.
 */
export type LocaleKey =
  | RawTranslationKey
  | `${PluralBaseKey<RawTranslationKey>}_${PluralCategory}`;

/**
 * A locale table. Partial by design: any key omitted falls back to English
 * rather than rendering a raw key, so a language can be filled in gradually.
 */
export type LocaleTable = Partial<Record<LocaleKey, string>>;
