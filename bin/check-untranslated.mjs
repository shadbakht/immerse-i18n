#!/usr/bin/env node
/**
 * Fail when user-visible English is hardcoded instead of coming from t().
 *
 * Both apps reached full translation by hand-sweeping roughly a hundred
 * literals that had accumulated unnoticed over months. Nothing objected while
 * they piled up, so the same drift would simply start again — and every
 * language added multiplies the cost of catching it late. This is the thing
 * that keeps "fully translated" true rather than a snapshot of one afternoon.
 *
 * Usage:  immerse-i18n-check <dir|file> [<dir|file>...]
 *
 * A file can be named directly: the mobile app's App.js lives at the repo
 * root, outside src/, and went unscanned while its first-launch screen stayed
 * English.
 *
 * Deliberate exceptions go in the consumer's package.json:
 *
 *   "i18nCheck": {
 *     "allow":       ["Immerse", "Made with Immerse"],
 *     "ignorePaths": ["__tests__", "scripts/"]
 *   }
 *
 * `allow` matches the flagged text exactly, so it stays narrow: allowing
 * "Immerse" does not quietly allow "Immerse is great".
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: immerse-i18n-check <dir|file> [<dir|file>...]');
  process.exit(2);
}

let config = { allow: [], ignorePaths: [] };
const pkgPath = resolve('package.json');
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  config = { ...config, ...(pkg.i18nCheck ?? {}) };
}
const allow = new Set(config.allow);
const ignorePaths = config.ignorePaths;

const SOURCE_FILE = /\.(ts|tsx|js|jsx)$/;
const files = [];
for (const target of targets) {
  if (!existsSync(target)) continue;
  if (statSync(target).isFile()) {
    if (SOURCE_FILE.test(target)) files.push(target);
    continue;
  }
  (function walk(d) {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (ignorePaths.some(ig => p.includes(ig))) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (SOURCE_FILE.test(p)) files.push(p);
    }
  })(target);
}

// Prose, not identifiers: needs a letter run, and must not be SCREAMING_CASE
// (those are constants) or punctuation/digits only (✓, ›, 40%).
const isProse = s =>
  /[A-Za-z]{3}/.test(s) && !/^[A-Z0-9_]+$/.test(s) && !/^[\d\s\W]*$/.test(s);

// A Tailwind class list is the one kind of style value that does contain
// spaces, so "has a space" alone would flag most of the web app's conditional
// styling. Its tokens are lowercase and carry a hyphen, a variant colon, or an
// arbitrary-value bracket; prose tokens carry none of those, and prose that
// earns a capital anywhere is not a class list at all.
const CLASS_TOKEN = /^-?[a-z][a-zA-Z0-9]*(?:[-:./][\w#[\]().%/-]*)+$/;
const looksLikeClassList = (s) => {
  const tokens = s.trim().split(/\s+/);
  if (tokens.some(t => /^[A-Z]/.test(t))) return false;
  return tokens.filter(t => CLASS_TOKEN.test(t)).length * 2 >= tokens.length;
};

// A route, path or URL is an address, not copy, even when a template literal
// gives it spaces: `/read/${id}${pid ? … : …}`.
const looksLikePath = (s) => /^\/|:\/\/|^\.{1,2}\//.test(s.trim());

// User-facing text starts with a capital or contains a space; style values and
// debug tokens ('auto', 'none', '45deg', 'defined') do neither.
const userFacing = (s) =>
  isProse(s) && (/^[A-Z]/.test(s) || s.includes(' ')) && !looksLikeClassList(s) && !looksLikePath(s);

// Parenthesis depth a line leaves behind, ignoring the ones inside strings so
// that a message like "…(Xcode → Product)…" does not read as an open call.
const depthAfter = (line, start) => {
  let depth = start;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
  }
  return depth;
};

const findings = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inBlockComment = false;
  let inConsoleCall = false;
  let prevTrimmed = '';

  lines.forEach((line, i) => {
    // Cheap comment handling: enough to avoid flagging prose in doc blocks.
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      return;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) return;
    if (trimmed.startsWith('/*')) {
      if (!line.includes('*/')) inBlockComment = true;
      return;
    }
    if (trimmed.startsWith('*')) return;

    // A wrapped console call reads exactly like a wrapped Alert: a sentence
    // alone on a line. Developer diagnostics are the one such sentence nobody
    // translates, so track when one is still open across lines.
    if (inConsoleCall) {
      inConsoleCall = depthAfter(line, 1) > 0;
      return;
    }
    if (/\bconsole\.(?:log|warn|error|info|debug)\s*\(/.test(line) && depthAfter(line, 0) > 0) {
      inConsoleCall = true;
      return;
    }

    const hits = [];
    // JSX text children: >Some words<
    // The lookbehind rejects `=>`, so an arrow function returning a generic
    // (`=> Promise<string[]>`) is not mistaken for JSX text.
    for (const m of line.matchAll(/(?<![=-])>\s*([A-Z][A-Za-z][^<>{}\n]{2,})</g)) {
      const text = m[1].trim();
      if (isProse(text)) hits.push(text);
    }
    // JSX text sitting on its own line, between a tag opened and closed on
    // other lines:
    //     <Text style={…}>
    //       Sign In / Create Account
    //     </Text>
    // The single-line pattern above cannot see this shape, and it hid a live
    // string in the navigation drawer.
    // Excludes anything that looks like code rather than copy: calls,
    // statements and assignments all end up on their own line too.
    const looksLikeCode = /[(){}[\];=<>|&]/.test(trimmed) || !trimmed.includes(' ');
    if (/>\s*$/.test(prevTrimmed) && !looksLikeCode && /^[A-Z]/.test(trimmed) && isProse(trimmed)) {
      hits.push(trimmed);
    }
    // String-literal props the user reads, both as a JSX attribute
    // (title="…") and as an object property (options={{ title: '…' }}).
    // The object form is how React Navigation declares header titles and
    // drawer labels; missing it hid every screen title in the app.
    for (const m of line.matchAll(
      /\b(placeholder|title|label|drawerLabel|headerTitle|description|accessibilityLabel|accessibilityHint)\s*[=:]\s*["']([^"']{3,})["']/g,
    )) {
      if (isProse(m[2])) hits.push(m[2]);
    }
    // Bare string arguments to a helper whose name says it renders a title,
    // e.g. stackHeaderOptions('Cross-References', …). Function arguments were
    // the other shape that slipped through.
    for (const m of line.matchAll(/\b\w*(?:HeaderOptions|Title|Label)\w*\(\s*['"]([^'"]{3,})['"]/g)) {
      if (isProse(m[1])) hits.push(m[1]);
    }
    // Alert.alert('Literal', 'Literal')
    for (const m of line.matchAll(/Alert\.alert\(\s*['"]([^'"]{3,})['"]\s*(?:,\s*['"]([^'"]{3,})['"])?/g)) {
      for (const g of [m[1], m[2]]) if (g && isProse(g)) hits.push(g);
    }
    // Alert BUTTON labels — `{ text: 'Cancel', style: 'cancel' }`. These sit in
    // the third argument's array, which the Alert.alert pattern above never
    // reaches, so the Cancel/Delete buttons of every confirm dialog hid here.
    for (const m of line.matchAll(/\btext\s*:\s*['"]([^'"]{3,})['"]/g)) {
      if (userFacing(m[1])) hits.push(m[1]);
    }
    // A string alone on a line — the shape every sentence takes once the call
    // holding it wraps, which is exactly when it is long enough to matter:
    //     Alert.alert(
    //       t('home.removeFromRecent'),
    //       `Remove "${item.title}" and reset reading progress to 0%?`,
    // The Alert.alert rule only ever saw arguments sharing the call's line, and
    // the quoted-string rules are all blind to backticks, so a message earned
    // an exemption by being long or by containing a variable. A leading `?` or
    // `:` is allowed for the arms of a ternary that wrapped the same way.
    // A line of its own is also where this codebase puts its SQL, its injected
    // WebView JavaScript and its log lines, so this rule asks for an actual
    // sentence: closing punctuation, and no leading SQL verb. That trades away
    // lone titles and labels, which every other rule already covers.
    const bare = trimmed.match(/^[?:]?\s*(['"`])(.{3,}?)\1\s*,?$/);
    if (bare) {
      const sentence = bare[2].replace(/\$\{[^}]*\}/g, '').trim();
      const isQuery =
        /^(?:SELECT|INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|BEGIN|COMMIT|WITH)\b/i.test(sentence);
      const isCode = /^[[(]/.test(sentence) || /[;)]$/.test(sentence) || sentence.includes('function(');
      if (!isQuery && !isCode && /[.?!…]$/.test(sentence) && userFacing(sentence)) hits.push(bare[2]);
    }
    // Ternaries picking between two literals, typically inside JSX braces:
    // `{isViewMode ? 'No tags on this selection' : 'No tags yet'}`. The JSX
    // text-child patterns only see bare text between tags, never inside braces.
    // Both arms must look like something a user reads, or this drowns in style
    // values ('auto' : 'none', '45deg' : '-45deg') and debug strings.
    for (const m of line.matchAll(/\?\s*['"]([^'"]{3,})['"]\s*:\s*['"]([^'"]{3,})['"]/g)) {
      if ([m[1], m[2]].every(userFacing)) for (const g of [m[1], m[2]]) hits.push(g);
    }
    // Label paired with a key in an array literal, the shape used to build tab
    // rows: `[['recent', 'Recent'], ['trending', 'Trending']]`. The key is
    // lowercase code, the second entry is the user-visible label.
    // A label is capitalised; a plain list of code values ('top', 'bottom' /
    // 'morning', 'evening' / category id prefixes) fits the same brackets and
    // is not text anyone reads.
    for (const m of line.matchAll(/\[\s*['"][a-z][\w-]*['"]\s*,\s*['"]([^'"]{3,})['"]\s*\]/g)) {
      if (userFacing(m[1])) hits.push(m[1]);
    }
    // A ternary arm that wrapped onto its own line. The "string alone on a
    // line" rule above asks for closing punctuation, which a button-style hint
    // ("…, then tap Done") or a status word ("✓ Available") never has, so
    // both arms of
    //     {Platform.OS === 'android'
    //       ? 'Long-press to make a new selection, then tap Done'
    //       : 'Adjust your selection, then tap Done'}
    // went unreported. A line opening with `?` or `:` is a ternary
    // continuation in this codebase; object keys never start a line that way.
    // A template arm that is mostly interpolation and one bare word around it
    // (`${label}, Ang ${n}` — the Guru Granth Sahib's own citation unit) is a
    // format string, so those must leave at least two words of prose.
    const arm = trimmed.match(/^[?:]\s*(['"`])(.{2,}?)\1/);
    if (arm) {
      const prose = arm[2].replace(/\$\{[^}]*\}/g, '').trim();
      const formatString = arm[1] === '`' && arm[2].includes('${') && !/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(prose);
      if (!formatString && userFacing(prose)) hits.push(arm[2]);
    }
    // The FIRST arm of a ternary whose line ends right after it — the head of
    // a chain that wraps one condition per line:
    //     : usernameStatus === 'available' ? '✓ Available'
    //     : usernameStatus === 'taken'     ? '✗ Already taken'
    const head = line.match(/\?\s*(['"])([^'"]{2,})\1\s*$/);
    if (head && userFacing(head[2])) hits.push(head[2]);
    // A literal fallback: `{book?.title || 'Table of Contents'}`,
    // `title: book?.title ?? 'Reader'`. The value usually comes from data, so
    // the English only shows when that data is missing — which is exactly when
    // nobody is looking.
    for (const m of line.matchAll(/(?:\|\||\?\?)\s*(['"])([^'"]{3,})\1/g)) {
      if (userFacing(m[2])) hits.push(m[2]);
    }
    // The initial value of a piece of state that is rendered as text:
    // `useState('Checking local library…')` painted the first-launch screen.
    for (const m of line.matchAll(/\buseState\(\s*(['"])([^'"]{3,})\1/g)) {
      if (userFacing(m[2])) hits.push(m[2]);
    }
    // JSX text that follows an expression on a line of its own:
    //     <Text style={styles.back}>
    //       {RTL ? '›' : '‹'} Tags
    //     </Text>
    // The text-child rules only start reading after a `>`, never after a `}`.
    const afterExpr = trimmed.match(/^\{[^{}]*\}\s*([A-Z][A-Za-z][^<>{}]*)$/);
    if (afterExpr && />\s*$/.test(prevTrimmed) && isProse(afterExpr[1].trim())) {
      hits.push(afterExpr[1].trim());
    }
    // Words glued to an expression inside one element: `{planPct}% read</Text>`.
    // Text between a `}` and a closing tag is a text child whatever its case.
    for (const m of line.matchAll(/\}([^<>{}\n`'"]*[A-Za-z]{3}[^<>{}\n`'"]*)<\//g)) {
      const text = m[1].trim();
      if (isProse(text)) hits.push(text);
    }
    // Words leading an expression on a line of their own, inside an element:
    //     <Text style={styles.viewAll}>
    //       View all {completions.length}
    // The bare-text rule skips any line holding a brace, since that is usually code.
    const beforeExpr = trimmed.match(/^([A-Z][A-Za-z]+(?: [A-Za-z]+)*)\s+\{[^{}]*\}$/);
    if (beforeExpr && />\s*$/.test(prevTrimmed) && isProse(beforeExpr[1])) {
      hits.push(beforeExpr[1]);
    }
    // A ternary whose other arm is the empty string: `{hasBook ? 'Change' : ''}`.
    // The two-literal ternary rule wants both arms to read as copy.
    for (const m of line.matchAll(/\?\s*(['"])([^'"]{3,})\1\s*:\s*(['"])\3|\?\s*(['"])\4\s*:\s*(['"])([^'"]{3,})\5/g)) {
      const text = m[2] ?? m[6];
      if (userFacing(text)) hits.push(text);
    }

    // One finding per string per line, however many rules saw it.
    for (const text of new Set(hits)) {
      if (allow.has(text)) continue;
      findings.push({ file, line: i + 1, text });
    }
    prevTrimmed = trimmed;
  });
}

if (findings.length === 0) {
  console.log(`i18n: no hardcoded UI strings in ${files.length} files`);
  process.exit(0);
}

console.error(`\ni18n: ${findings.length} hardcoded UI string(s) found.\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.text}`);
}
console.error(
  '\nMove these into @immerse/i18n and read them with t(), or — if the English' +
  '\nis deliberate — add the exact text to "i18nCheck".allow in package.json.\n',
);
// Not process.exit(1): writes to a pipe or a file are asynchronous, and exiting
// discards whatever is still buffered. Redirecting the report to a log left the
// count and nothing under it — the failure looks like a passing list of zero.
process.exitCode = 1;
