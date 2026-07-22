// Uses node:test rather than Jest so the package verifies itself with no
// dependencies — the two consumers have different test runners (jest-expo and
// none), and neither should be required to prove this package works.

import test from 'node:test';
import assert from 'node:assert/strict';

import { translate, LOCALES, SUPPORTED_UI_LANGUAGES } from '../index';
import { UI_LANGUAGES } from '../languages';
import { en } from '../en';
import { es } from '../es';

/** Every locale except English, which is the reference the others are held to. */
const TRANSLATIONS = Object.entries(LOCALES).filter(([code]) => code !== 'en');

test('returns the requested locale when present', () => {
  assert.equal(translate('es', 'common.cancel'), 'Cancelar');
});

test('falls back to English rather than showing a raw key', () => {
  // A key present in en but deliberately absent from es.
  const missing = Object.keys(en).find(k => !(k in es)) as keyof typeof en | undefined;
  if (!missing) return;                       // es is complete — nothing to assert
  assert.equal(translate('es', missing), en[missing]);
});

test('falls back to English for an entirely unknown locale', () => {
  assert.equal(translate('tr', 'common.cancel'), 'Cancel');
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

test('uses a locale\'s _few / _many rather than collapsing them into _other', () => {
  // The regression test for the rule this package used to apply. Under
  // `count === 1 ? _one : _other`, every count below would have returned
  // 'книг' — correct only for 5. Russian: 1 one, 2–4 few, 5+ many.
  const ru = {
    'common.book_one':  '{{count}} книга',
    'common.book_few':  '{{count}} книги',
    'common.book_many': '{{count}} книг',
    'common.book_other': '{{count}} книги',
  };
  (LOCALES as Record<string, unknown>).ru = ru;
  try {
    assert.equal(translate('ru', 'common.book', { count: 1 }), '1 книга');
    assert.equal(translate('ru', 'common.book', { count: 3 }), '3 книги');  // few
    assert.equal(translate('ru', 'common.book', { count: 5 }), '5 книг');   // many
  } finally {
    delete (LOCALES as Record<string, unknown>).ru;
  }
});

test('a locale supplying only _one/_other still stays in its own language', () => {
  // A translator who fills in just the English-shaped pair must not have
  // counts drop through to English mid-sentence: 5 is 'many' in Russian, which
  // this table does not define, so it has to land on ru's own _other.
  const ru = { 'common.book_one': '{{count}} книга', 'common.book_other': '{{count}} книг' };
  (LOCALES as Record<string, unknown>).ru = ru;
  try {
    assert.equal(translate('ru', 'common.book', { count: 5 }), '5 книг');
  } finally {
    delete (LOCALES as Record<string, unknown>).ru;
  }
});

test('falls back to English only when the locale has nothing for the count', () => {
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

test('no locale has a key absent from English, which would be unreachable', () => {
  for (const [code, table] of TRANSLATIONS) {
    assert.deepEqual(
      { code, orphans: Object.keys(table).filter(k => !(k in en)) },
      { code, orphans: [] },
    );
  }
});

test('every locale keeps English\'s interpolation placeholders', () => {
  const placeholders = (s: string) => (s.match(/\{\{(\w+)\}\}/g) ?? []).sort();
  for (const [code, table] of TRANSLATIONS) {
    for (const [key, value] of Object.entries(table)) {
      const source = en[key as keyof typeof en];
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

test('UI_LANGUAGES and the locale tables stay in step', () => {
  // Two lists that must agree: one drives the language picker, the other is
  // what translate() can actually resolve. A picker entry with no table would
  // silently render the whole app in English.
  assert.deepEqual(
    UI_LANGUAGES.map(l => l.code).sort(),
    [...SUPPORTED_UI_LANGUAGES].sort(),
  );
});
