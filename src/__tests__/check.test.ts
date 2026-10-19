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
  // A ternary chain wrapped one condition per line: the head of each arm ends
  // its line, and the last arm opens one.
  '✓ Available',
  '✗ Already taken',
  '3–20 chars: letters, numbers, _',
  // Wrapped ternary arms with no closing punctuation.
  'Long-press to make a new selection, then tap Done',
  'Adjust your selection, then tap Done',
  // Literal fallbacks after || and ??.
  'Table of Contents',
  'Reader',
  // The initial value of state that is rendered as text.
  'Checking local library…',
  // JSX text after an expression, on a line of its own.
  'Tags',
  // Words glued to an expression before a closing tag.
  '% read',
  // Words leading an expression on a line of their own.
  'View all',
  // A ternary whose other arm is empty.
  'Change',
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
const k = (
  <Text>
    {status === 'checking'  ? '…'
    : status === 'available' ? '✓ Available'
    : status === 'taken'     ? '✗ Already taken'
    : '3–20 chars: letters, numbers, _'}
  </Text>
);
const l = (
  <Text>
    {Platform.OS === 'android'
      ? 'Long-press to make a new selection, then tap Done'
      : 'Adjust your selection, then tap Done'}
  </Text>
);
const m = <Text>{book?.title || 'Table of Contents'}</Text>;
navigation.setOptions({ title: book?.title ?? 'Reader' });
const [message, setMessage] = useState('Checking local library…');
const n = (
  <Text style={styles.back}>
    {RTL ? '›' : '‹'} Tags
  </Text>
);
const o = <Text style={styles.bookSub}>{planPct}% read</Text>;
const p = (
  <Text style={styles.viewAll}>
    View all {completions.length}
  </Text>
);
const q = <Text>{config.plan.bookId ? 'Change' : ''}</Text>;

// Everything below is code, not copy, and must stay silent.
const count = <Text>{done}/{total}</Text>;
const suffix = enabled ? '' : 'none';
const wrap = (
  <View>
    {items.map(i => <Row key={i} />)}
  </View>
);
const font = { fontFamily: 'EB Garamond' };
const size = prefs.size ?? 'medium';
const side = rtl
  ? 'right'
  : 'left';
const href = imported
  ? null
  : \`/read/\${id}\${pid ? \`?p=\${pid}\` : ''}\`;
const cite = ang
  ? \`\${label('citation.guruGranthSahib')}, Ang \${ang}\`
  : label('citation.guruGranthSahib');
type Size = 'Small' | 'Large';
const tab = state?.routes?.[0]?.name ?? HOME_ROUTE;
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
  assert.ok(output.includes(`${CAUGHT.length} hardcoded UI string(s) found`));
  assert.equal(output.split('\n').filter(l => l.startsWith('    ')).length, CAUGHT.length);
});

test('scans a file named directly, not only directories', () => {
  // The mobile app's App.js sits at the repo root, outside src/, and its
  // first-launch screen stayed English because only folders could be named.
  const dir = mkdtempSync(join(tmpdir(), 'i18n-check-'));
  try {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'Clean.tsx'), "const a = <Text>{t('tags.empty')}</Text>;\n");
    writeFileSync(join(dir, 'App.js'), 'const s = <Text style={styles.title}>Setting up Immerse</Text>;\n');
    writeFileSync(join(dir, 'package.json'), '{}');
    let status = 0;
    let output = '';
    try {
      output = execFileSync(process.execPath, [BIN, 'src', 'App.js'], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e: any) {
      status = e.status;
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    assert.equal(status, 1);
    assert.ok(output.includes('App.js:1'));
    assert.ok(output.includes('Setting up Immerse'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('passes a file with nothing hardcoded', () => {
  const clean = "const a = <Text>{t('tags.empty')}</Text>;\n";
  const { status, output } = scan(clean);
  assert.equal(status, 0);
  assert.match(output, /no hardcoded UI strings/);
});
