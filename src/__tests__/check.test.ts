// The scanner's own test, written against the strings it actually missed.
//
// Twice now a release went out reported as "fully translated" while a whole
// screen was still English — the navigation chrome once, the confirm dialogs
// the next time. In both cases the scanner exited 0 because it had no rule for
// the construct, and a clean exit reads exactly like a clean codebase. The
// fixture below is every construct that has hidden a live string, plus the
// lookalikes that made naive rules unusable: Tailwind class ternaries, SQL,
// injected WebView JavaScript, log lines, and lists of code values.
//
// A rule added without a case here is a rule nothing is holding still.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Resolved from dist/__tests__/, where this file runs after the build.
const BIN = resolve(__dirname, '../../bin/check-untranslated.mjs');

const CAUGHT = [
  // Alert title and body sharing the call's line.
  'Delete tag',
  'This cannot be undone',
  // Alert button labels, in the third argument's array.
  'Cancel',
  'Delete',
  // Ternary arms inside JSX braces.
  'No tags on this selection',
  'No tags yet',
  // [key, label] rows, the shape tab bars are built from.
  'Recent',
  'Trending',
  // Plain JSX text.
  'Delete Account',
  // Arguments of a call that wrapped: a template literal, a quoted string, and
  // a ternary arm, each alone on its line.
  'Remove "${item.title}" and reset reading progress to 0%?',
  'The two highlighted selections will be kept.',
  'Your Pro subscription has been restored.',
];

const FIXTURE = `
const a = Alert.alert('Delete tag', 'This cannot be undone', [
  { text: 'Cancel', style: 'cancel' },
  { text: 'Delete', style: 'destructive', onPress: doIt },
]);
const b = <Text>{isViewMode ? 'No tags on this selection' : 'No tags yet'}</Text>;
const c = [['recent', 'Recent'], ['trending', 'Trending']];
const d = <Text>Delete Account</Text>;

Alert.alert(
  t('home.removeFromRecent'),
  \`Remove "\${item.title}" and reset reading progress to 0%?\`,
);
Alert.alert(
  t('xrefs.deleteConfirm'),
  'The two highlighted selections will be kept.',
);
Alert.alert(
  ok ? t('a') : t('b'),
  ok
    ? 'Your Pro subscription has been restored.'
    : t('settings.noSubscriptionBody'),
);

// Everything below is code, not copy, and must stay silent.
const e = { transform: rotate ? '45deg' : '-45deg' };
const f = { pointerEvents: on ? 'auto' : 'none' };
const g = state === 'indeterminate' ? 'border-[#1B6B7B] dark:border-[#2D9DB3]' : 'border-gray-300 dark:border-[#3A4D60]';
const h = <span className={\`truncate \${lvl === 0 ? 'text-sm font-medium text-gray-800 dark:text-[#D2DCE8]' : 'text-sm text-gray-700 dark:text-[#B8C7D6]'}\`} />;
const i = organizing ? 'bg-[#1B6B7B] dark:bg-[#2D9DB3] text-white' : 'text-[#1B6B7B] dark:text-[#2D9DB3] hover:bg-[#1B6B7B]/10';
const j = big ? 'w-5 bg-[#1B6B7B] dark:bg-[#2D9DB3]' : 'w-1.5 bg-gray-300 hover:bg-gray-400 dark:hover:bg-[#3F5468]';
const q1 = db.getAllAsync(
  \`SELECT id, title FROM books WHERE \${clause} ORDER BY RANDOM() LIMIT 1\`,
);
const q2 = db.runAsync(
  \`INSERT INTO _pending_deletes (table_name, record_id) VALUES (?, ?)\`,
);
webref.injectJavaScript(
  \`(function(){var y=(window.scrollY||0);window.scrollTo(0,y+(\${dy}));})();true\`,
);
console.warn(
  '[defineWord] DictionaryModule not found. ' +
  'Run a full native rebuild (Xcode → Product → Clean Build Folder, then Run).'
);
const edges = ['top', 'bottom'];
const slots = ['morning', 'evening'] as SlotName[];
const cats = { catPrefixes: ['cat-bahai-the-bb', 'cat-bahai-bahullh'] };
`;

/** Run the scanner over a throwaway project and return its report. */
function scan(source: string): { status: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-check-'));
  try {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'Fixture.tsx'), source);
    writeFileSync(join(dir, 'package.json'), '{}');
    try {
      const output = execFileSync(process.execPath, [BIN, 'src'], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, output };
    } catch (e: any) {
      return { status: e.status, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('finds every construct that has hidden a live string', () => {
  const { status, output } = scan(FIXTURE);
  assert.equal(status, 1, 'the fixture is full of hardcoded strings');
  for (const text of CAUGHT) {
    assert.ok(output.includes(text), `missed: ${text}`);
  }
});

test('stays silent on code that merely looks like copy', () => {
  const { output } = scan(FIXTURE);
  const found = output
    .split('\n')
    .filter(l => l.startsWith('    '))
    .map(l => l.trim());
  // Anything reported that the fixture does not declare as copy is a false
  // positive, and false positives are what get a checker switched off.
  const extra = found.filter(f => !CAUGHT.includes(f));
  assert.deepEqual(extra, []);
});

test('writes the whole report when its output is not a terminal', () => {
  // execFileSync pipes stdout and stderr, which is where an exit-on-write race
  // shows up: the count arrives and the findings under it are lost.
  const { output } = scan(FIXTURE);
  assert.ok(output.includes('12 hardcoded UI string(s) found'));
  assert.equal(output.split('\n').filter(l => l.startsWith('    ')).length, CAUGHT.length);
});

test('passes a file with nothing hardcoded', () => {
  const clean = "const a = <Text>{t('tags.empty')}</Text>;\n";
  const { status, output } = scan(clean);
  assert.equal(status, 0);
  assert.match(output, /no hardcoded UI strings/);
});
