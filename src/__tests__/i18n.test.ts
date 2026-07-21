// Uses node:test rather than Jest so the package verifies itself with no
// dependencies — the two consumers have different test runners (jest-expo and
// none), and neither should be required to prove this package works.

import test from 'node:test';
import assert from 'node:assert/strict';

import { translate } from '../index';
import { en } from '../en';
import { es } from '../es';

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

test('has no Spanish key absent from English, which would be unreachable', () => {
  assert.deepEqual(Object.keys(es).filter(k => !(k in en)), []);
});

test('keeps interpolation placeholders consistent between locales', () => {
  const placeholders = (s: string) => (s.match(/\{\{(\w+)\}\}/g) ?? []).sort();
  for (const [key, value] of Object.entries(es)) {
    const source = en[key as keyof typeof en];
    if (!source || !value) continue;
    assert.deepEqual(
      { key, vars: placeholders(value) },
      { key, vars: placeholders(source) },
    );
  }
});
