// Keep the artifact self-contained; edit translations in the plain table.
const fs = require('fs'), path = require('path');
const base = path.resolve(__dirname, '..');
const rows = fs.readFileSync(path.join(base, 'locales/messages.tsv'), 'utf8').replace(/\r/g, '').split('\n').filter(Boolean);
const header = rows.shift().split('|');
if (header.join('|') !== 'key|en|ja|zh-Hans|zh-Hant|es|pt-BR|hi|id') throw Error('Unexpected locale columns');
const catalog = {};
for (const [index, row] of rows.entries()) {
  const cells = row.split('|');
  if (cells.length !== header.length) throw Error('Translation row ' + (index + 2) + ': expected ' + header.length + ' columns, got ' + cells.length);
  if (catalog[cells[0]]) throw Error('Duplicate translation: ' + cells[0]);
  const placeholders = value => [...value.matchAll(/\{\d+\}/g)].map(m => m[0]).sort().join(',');
  for (const value of cells.slice(1)) {
    if (!value.trim()) throw Error('Empty translation: ' + cells[0]);
    if (placeholders(value) !== placeholders(cells[0])) throw Error('Placeholder mismatch: ' + cells[0]);
  }
  catalog[cells[0]] = cells.slice(1);
}
const runtime = fs.readFileSync(path.join(base, 'locales/runtime.js'), 'utf8')
  .replace('__CATALOG__', JSON.stringify(catalog).replace(/</g, '\\u003c'));
const file = path.join(base, 'water-sort-survival.html');
let source = fs.readFileSync(file, 'utf8');
for (const match of source.matchAll(/\btr\("((?:\\.|[^"\\])*)"/g)) {
  const key = JSON.parse('"' + match[1] + '"');
  if (!catalog[key]) throw Error('Missing UI translation: ' + key);
}
const script = '<script id="i18n">\n' + runtime + '\n</script>\n';
source = /<script id="i18n">[\s\S]*?<\/script>\r?\n/.test(source)
  ? source.replace(/<script id="i18n">[\s\S]*?<\/script>\r?\n/, () => script)
  : source.replace('<script id="engine">', () => script + '<script id="engine">');
fs.writeFileSync(file, source);
console.log('Embedded ' + Object.keys(catalog).length + ' messages in ' + header.length + ' languages including Korean.');
