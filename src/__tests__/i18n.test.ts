// Uses node:test rather than Jest so the package verifies itself with no
// dependencies — the two consumers have different test runners (jest-expo and
// none), and neither should be required to prove this package works.

import test from 'node:test';
import assert from 'node:assert/strict';

import { translate, LOCALES, SUPPORTED_UI_LANGUAGES } from '../index';
import { UI_LANGUAGES, isRTL, directionOf, RTL_LANGUAGES, LANGUAGE_LABELS } from '../languages';
import { en } from '../en';

/** Every locale except English, which is the reference the others are held to. */
const TRANSLATIONS = Object.entries(LOCALES).filter(([code]) => code !== 'en');

test('returns the requested locale when present', () => {
  assert.equal(translate('es', 'common.cancel'), 'Cancelar');
});

test('falls back to English rather than showing a raw key', () => {
  // Written against a stand-in table rather than a gap in es, which is how this
  // used to work: it looked for the first key Spanish was missing and returned
  // early when there was none. Spanish has been complete for releases, so the
  // assertion had quietly stopped running — a green test that tested nothing.
  withLocale('zz', { 'common.cancel': 'Zzz' }, () => {
    assert.equal(translate('zz', 'common.cancel'), 'Zzz');
    assert.equal(translate('zz', 'common.save'), en['common.save']);
  });
});

test('falls back to English for an entirely unknown locale', () => {
  // 'zz' rather than a real language: this assertion used to name 'tr', and the
  // day Turkish shipped it started failing for the one reason a test never
  // should — the product got better. A code no locale will ever claim keeps the
  // check about unknown locales instead of about which languages exist.
  assert.equal(translate('zz', 'common.cancel'), 'Cancel');
});

test('interpolates variables', () => {
  assert.equal(
    translate('en', 'settings.removeLanguageTitle', { language: 'Español' }),
    'Remove Español?',
  );
});

test('leaves unknown placeholders untouched instead of printing undefined', () => {
  assert.equal(
    translate('en', 'settings.removeLanguageTitle', {}),
    'Remove {{language}}?',
  );
});

test('selects singular and plural by count, in both locales', () => {
  assert.equal(translate('en', 'common.book', { count: 1 }), '1 book');
  assert.equal(translate('en', 'common.book', { count: 5 }), '5 books');
  assert.equal(translate('es', 'common.book', { count: 1 }), '1 libro');
  assert.equal(translate('es', 'common.book', { count: 5 }), '5 libros');
  assert.equal(translate('fr', 'common.book', { count: 1 }), '1 livre');
  assert.equal(translate('fr', 'common.book', { count: 5 }), '5 livres');
});

test('the shipped tables count the way their own language counts', () => {
  // Written against the real tables, not fixtures, because these are the three
  // shapes the package has to get right and each one fails differently:
  // Russian needs four forms, Chinese and Turkish need exactly one.
  assert.equal(translate('ru', 'common.book', { count: 1 }), '1 книга');
  assert.equal(translate('ru', 'common.book', { count: 3 }), '3 книги');   // few
  assert.equal(translate('ru', 'common.book', { count: 5 }), '5 книг');    // many

  // Chinese has a single CLDR category, so one book and five are written alike
  // — and a count of 1 must still find the table rather than falling to English.
  assert.equal(translate('zh', 'common.book', { count: 1 }), '1 本书');
  assert.equal(translate('zh', 'common.book', { count: 5 }), '5 本书');

  // Turkish keeps the noun singular after a numeral, so `one` resolving to the
  // `_other` entry is the correct reading, not a gap in the table.
  assert.equal(translate('tr', 'common.book', { count: 1 }), '1 kitap');
  assert.equal(translate('tr', 'common.book', { count: 5 }), '5 kitap');

  // Persian is a fourth shape, and the only one English cannot stand in for:
  // its `one` category covers ZERO as well as one, where English counts zero as
  // `other`. The table writes only `_other`, so a count of 0 asks for a category
  // that is absent and has to resolve through Persian's own `_other` — if that
  // middle step ever regressed, this is the assertion that would catch it, in
  // English, in the middle of a Persian screen.
  assert.equal(translate('fa', 'common.book', { count: 0 }), '0 کتاب');
  assert.equal(translate('fa', 'common.book', { count: 1 }), '1 کتاب');
  assert.equal(translate('fa', 'common.book', { count: 5 }), '5 کتاب');
});

test('treats zero as plural', () => {
  assert.equal(translate('en', 'common.book', { count: 0 }), '0 books');
});

// ─── Plural rules beyond one/other ──────────────────────────────────────────
// The reason this package uses Intl.PluralRules rather than `count === 1`.
// These languages are already in LANGUAGE_LABELS, so the rules matter before
// the translations arrive, not after.

test('selects the CLDR category for the locale, not English\'s rule', () => {
  // Verifies the engine running the tests actually has usable plural data; if
  // this fails, the assertions below are meaningless rather than wrong.
  assert.equal(typeof Intl?.PluralRules, 'function');

  const cat = (locale: string, n: number) => new Intl.PluralRules(locale).select(n);

  // Arabic distinguishes six categories where English sees two.
  assert.equal(cat('ar', 0), 'zero');
  assert.equal(cat('ar', 2), 'two');
  assert.equal(cat('ar', 3), 'few');
  // Polish and Russian: 2 is 'few', 5 is 'many' — both 'other' under the old rule.
  assert.equal(cat('pl', 2), 'few');
  assert.equal(cat('ru', 5), 'many');
});

/**
 * Swap in a stand-in table for the duration of one test.
 *
 * These tests used to assign `LOCALES.ru` and `delete` it afterwards, which was
 * harmless only while Russian was hypothetical: once ru shipped, the delete
 * would have thrown the real table away and left every later test in this file
 * reading whatever ran first. Restoring what was there keeps the fixture local
 * to the test that needs it.
 */
function withLocale(code: string, table: Record<string, string>, body: () => void) {
  const registry = LOCALES as Record<string, unknown>;
  const had = code in registry;
  const previous = registry[code];
  registry[code] = table;
  try {
    body();
  } finally {
    if (had) registry[code] = previous;
    else delete registry[code];
  }
}

test('uses a locale\'s _few / _many rather than collapsing them into _other', () => {
  // The regression test for the rule this package used to apply. Under
  // `count === 1 ? _one : _other`, every count below would have returned
  // 'книг' — correct only for 5. Russian: 1 one, 2–4 few, 5+ many.
  withLocale('ru', {
    'common.book_one':  '{{count}} книга',
    'common.book_few':  '{{count}} книги',
    'common.book_many': '{{count}} книг',
    'common.book_other': '{{count}} книги',
  }, () => {
    assert.equal(translate('ru', 'common.book', { count: 1 }), '1 книга');
    assert.equal(translate('ru', 'common.book', { count: 3 }), '3 книги');  // few
    assert.equal(translate('ru', 'common.book', { count: 5 }), '5 книг');   // many
  });
});

test('a locale supplying only _one/_other still stays in its own language', () => {
  // A translator who fills in just the English-shaped pair must not have
  // counts drop through to English mid-sentence: 5 is 'many' in Russian, which
  // this table does not define, so it has to land on ru's own _other.
  withLocale('ru', {
    'common.book_one': '{{count}} книга',
    'common.book_other': '{{count}} книг',
  }, () => {
    assert.equal(translate('ru', 'common.book', { count: 5 }), '5 книг');
  });
});

test('falls back to English only when the locale has nothing for the count', () => {
  // Polish, deliberately: it has real few/many rules, so this proves the count
  // reached the plural machinery and still found nothing, rather than never
  // having been counted at all. If Polish is ever added, replace it with
  // another unregistered language that declines — not with a sentinel code.
  assert.equal(translate('pl', 'common.book', { count: 3 }), '3 books');
});

test('resolves a non-plural key normally even when count is passed', () => {
  // Counted and uncounted strings must stay interchangeable, so a key with no
  // _one/_other variants should not fall through to the raw key.
  assert.equal(translate('en', 'common.cancel', { count: 2 }), 'Cancel');
});

test('returns the key itself for a genuinely unknown key', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(translate('en', 'does.not.exist' as never), 'does.not.exist');
  } finally {
    console.warn = warn;
  }
});

// ─── Guards applied to every locale ─────────────────────────────────────────
// These used to name `es` directly, so a third locale would have shipped with
// nothing checking it at all. Driving them off LOCALES means each new language
// inherits the full set the day it is registered.

const CATEGORY = /_(zero|one|two|few|many|other)$/;
const baseOf = (key: string) => key.replace(CATEGORY, '');

/** The plural groups English defines, by base name. */
const EN_PLURAL_BASES = new Set(
  Object.keys(en).filter(k => CATEGORY.test(k)).map(baseOf),
);

/**
 * The English string a locale's key is answerable to.
 *
 * For most keys that is the key itself. For a plural variant English does not
 * write — ru's `common.book_many`, say — it is the group's `_other`, which is
 * the only English form the whole group can be compared against.
 */
function englishFor(key: string): string | undefined {
  const direct = en[key as keyof typeof en];
  if (direct) return direct;
  if (CATEGORY.test(key) && EN_PLURAL_BASES.has(baseOf(key))) {
    return en[`${baseOf(key)}_other` as keyof typeof en];
  }
  return undefined;
}

test('no locale has a key absent from English, which would be unreachable', () => {
  // A CLDR category English never needs is not an orphan: Russian writes
  // `_few` and `_many` for groups English writes with `_one` and `_other`, and
  // translate() reaches them through the same base key. Anything else is a
  // typo that would never render.
  const unreachable = (key: string) =>
    !(key in en) && !(CATEGORY.test(key) && EN_PLURAL_BASES.has(baseOf(key)));

  for (const [code, table] of TRANSLATIONS) {
    assert.deepEqual(
      { code, orphans: Object.keys(table).filter(unreachable) },
      { code, orphans: [] },
    );
  }
});

test('every locale keeps English\'s interpolation placeholders', () => {
  const placeholders = (s: string) => (s.match(/\{\{(\w+)\}\}/g) ?? []).sort();
  for (const [code, table] of TRANSLATIONS) {
    for (const [key, value] of Object.entries(table)) {
      const source = englishFor(key);
      if (!source || !value) continue;
      assert.deepEqual(
        { code, key, vars: placeholders(value) },
        { code, key, vars: placeholders(source) },
      );
    }
  }
});

test('every plural group in every locale offers an _other fallback', () => {
  // `_other` is the last resort for any CLDR category a table does not define.
  // Without it a count can fall through to English mid-sentence.
  for (const [code, table] of [['en', en] as const, ...TRANSLATIONS]) {
    const bases = new Set(
      Object.keys(table)
        .filter(k => /_(zero|one|two|few|many|other)$/.test(k))
        .map(k => k.replace(/_(zero|one|two|few|many|other)$/, '')),
    );
    for (const base of bases) {
      assert.ok(
        `${base}_other` in table,
        `${code}: plural group '${base}' has no _other variant`,
      );
    }
  }
});

test('identifies right-to-left languages, including regional variants', () => {
  assert.equal(isRTL('ar'), true);
  assert.equal(isRTL('fa'), true);
  assert.equal(isRTL('ar-EG'), true);          // regional variant
  assert.equal(isRTL('AR'), true);             // case-insensitive
  assert.equal(isRTL('en'), false);
  assert.equal(isRTL('es'), false);
  assert.equal(isRTL(null), false);            // no language chosen yet
  assert.equal(isRTL(undefined), false);
  assert.equal(directionOf('fa'), 'rtl');
  assert.equal(directionOf('en'), 'ltr');
});

test('every RTL language has a display label', () => {
  // A language that mirrors the layout but shows a raw code in the picker
  // would be a half-added language; this catches the half.
  for (const code of RTL_LANGUAGES) {
    assert.ok(LANGUAGE_LABELS[code], `no LANGUAGE_LABELS entry for '${code}'`);
  }
});

test('every registered locale answers every English key', () => {
  // The tables are typed Partial so a translation in progress can be built up
  // and typechecked before it is wired in. Registering one in LOCALES is the
  // other side of that: it puts the language in the picker, and a picker entry
  // that renders half the screen in English is the "half-added language" this
  // file already refuses elsewhere. Partial while unregistered, complete once
  // it ships.
  for (const [code, table] of TRANSLATIONS) {
    const covered = new Set(Object.keys(table).map(baseOf));
    const missing = Object.keys(en).filter(k => !(k in table) && !covered.has(baseOf(k)));
    assert.deepEqual({ code, missing }, { code, missing: [] });
  }
});

test('UI_LANGUAGES and the locale tables stay in step', () => {
  // Two lists that must agree: one drives the language picker, the other is
  // what translate() can actually resolve. A picker entry with no table would
  // silently render the whole app in English.
  assert.deepEqual(
    UI_LANGUAGES.map(l => l.code).sort(),
    [...SUPPORTED_UI_LANGUAGES].sort(),
  );
});
