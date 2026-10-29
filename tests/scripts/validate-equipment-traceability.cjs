const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const { parseCurrentCases } = require('./traceability.cjs');
const root = resolve(__dirname, '../..');
const ts = createRequire(resolve(root, 'frontend/package.json'))('typescript');
let failed = false;
function problem(message) { failed = true; console.error(message); }
for (const story of [40, 41, 42, 47]) {
  const recordPath = resolve(root, `tests/records/CS-${story}/test-cases.md`);
  const record = readFileSync(recordPath, 'utf8');
  const cases = parseCurrentCases(record);
  if (!cases.length) { problem(`CS-${story}: missing current Jira-aligned test-case table`); continue; }
  const current = new Map(cases.map(item => [item.id, item]));
  const file = resolve(root, `frontend/e2e/CS-${story}.spec.ts`);
  const source = existsSync(file) ? ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true) : null;
  const adopted = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (['test.skip', 'test.fixme', 'test.only'].includes(name)) problem(`CS-${story}: forbidden ${name}`);
      if (name === 'test' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const ids = node.arguments[0].text.match(/TC-CS\d+-\d+/g) || [];
        if (ids.length !== 1) problem(`CS-${story}: each test must name exactly one full canonical ID`);
        for (const id of ids) {
          const item = current.get(id);
          if (!item) problem(`CS-${story}: foreign or unrecorded ID ${id}`);
          else if (!item.layers.includes('E2E')) problem(`${id}: E2E test exists but E2E is not a declared layer`);
          adopted.push(id);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  if (source) visit(source);
  for (const item of cases) {
    for (const layer of item.layers) {
      const location = item.layerLocations[layer];
      if (!location) problem(`${item.id}: ${layer} declaration must name an assertion file`);
      else if (!existsSync(resolve(root, location))) problem(`${item.id}: missing ${layer} assertion file ${location}`);
    }
    if (item.layers.includes('E2E') && adopted.filter(value => value === item.id).length !== 1) problem(`${item.id}: expected exactly one executable E2E declaration`);
  }
  if (new Set(cases.map(item => item.id)).size !== cases.length) problem(`CS-${story}: duplicate recorded IDs`);
  for (const match of record.matchAll(/\]\(([^)]+)\)/g)) {
    if (!/^(https?:|#)/.test(match[1]) && !existsSync(resolve(recordPath, '..', match[1].split('#')[0]))) problem(`CS-${story}: invalid adoption link ${match[1]}`);
  }
  console.log(`CS-${story}: ${cases.length} current cases, ${cases.filter(item => item.layers.includes('E2E')).length} E2E-required cases, ${adopted.length} executable E2E declarations`);
}
process.exitCode = failed ? 1 : 0;
