// Fails when the source uses a translation key that neither string table defines.
// Keys built at runtime (template literals) are checked by their fixed prefix.
// The tables are the original en/ar JSON plus src/i18n/extra.ts, which must define each of its keys in both languages.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const extraSrc = readFileSync('src/i18n/extra.ts', 'utf8');
const split = extraSrc.indexOf('\n  ar: {');
const keysIn = (src) => new Set([...src.matchAll(/^\s*'([\w.#-]+)':/gm)].map((m) => m[1]));
const extraEn = keysIn(extraSrc.slice(0, split));
const extraAr = keysIn(extraSrc.slice(split));

const en = { ...JSON.parse(readFileSync('src/i18n/en.json', 'utf8')), ...Object.fromEntries([...extraEn].map((k) => [k, ''])) };
const ar = { ...JSON.parse(readFileSync('src/i18n/ar.json', 'utf8')), ...Object.fromEntries([...extraAr].map((k) => [k, ''])) };

const known = (table, key) => key in table || `${key}#other` in table;
const prefixKnown = (prefix) => Object.keys(en).some((k) => k.startsWith(prefix));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const problems = [];
for (const key of extraEn) {
  const base = key.split('#')[0];
  if (!known(ar, base)) problems.push(`src/i18n/extra.ts: ${base} (missing in Arabic)`);
}
for (const file of files('src')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) {
    const key = m[1];
    if (!known(en, key)) problems.push(`${file}: ${key}`);
    else if (!known(ar, key)) problems.push(`${file}: ${key} (missing in Arabic)`);
  }
  for (const m of src.matchAll(/\bt\(\s*`([\w.]+)\$\{/g)) {
    if (!prefixKnown(m[1])) problems.push(`${file}: ${m[1]}* (no key starts with this)`);
  }
}

if (problems.length) {
  console.error(`${problems.length} unknown translation key(s):\n${[...new Set(problems)].join('\n')}`);
  process.exit(1);
}
console.log('All translation keys resolve.');
