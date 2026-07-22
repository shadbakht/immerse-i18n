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
 * Usage:  immerse-i18n-check <dir> [<dir>...]
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

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: immerse-i18n-check <dir> [<dir>...]');
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

const files = [];
for (const dir of dirs) {
  (function walk(d) {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (ignorePaths.some(ig => p.includes(ig))) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx)$/.test(p)) files.push(p);
    }
  })(dir);
}

// Prose, not identifiers: needs a letter run, and must not be SCREAMING_CASE
// (those are constants) or punctuation/digits only (✓, ›, 40%).
const isProse = s =>
  /[A-Za-z]{3}/.test(s) && !/^[A-Z0-9_]+$/.test(s) && !/^[\d\s\W]*$/.test(s);

// User-facing text starts with a capital or contains a space; style values and
// debug tokens ('auto', 'none', '45deg', 'defined') do neither.
const userFacing = (s) => isProse(s) && (/^[A-Z]/.test(s) || s.includes(' '));

const findings = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inBlockComment = false;
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
    for (const m of line.matchAll(/\[\s*['"][a-z][\w-]*['"]\s*,\s*['"]([^'"]{3,})['"]\s*\]/g)) {
      if (isProse(m[1])) hits.push(m[1]);
    }

    for (const text of hits) {
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
process.exit(1);
