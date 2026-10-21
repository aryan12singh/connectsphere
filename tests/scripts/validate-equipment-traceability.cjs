const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { createRequire } = require('node:module');
const root = resolve(__dirname, '../..');
const ts = createRequire(resolve(root, 'frontend/package.json'))('typescript');
let failed = false;
function problem(message) { failed = true; console.error(message); }
for (const story of [40, 41, 42]) {
  const recordPath = resolve(root, `tests/records/CS-${story}/test-cases.md`);
  const record = readFileSync(recordPath, 'utf8');
  const required = [...record.matchAll(/^\| (TC-CS\d+-\d+) \|/gm)].map(match => match[1]);
  const file = resolve(root, `frontend/e2e/CS-${story}.spec.ts`);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const adopted = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (['test.skip', 'test.fixme', 'test.only'].includes(name)) problem(`CS-${story}: forbidden ${name}`);
      if (name === 'test' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const ids = node.arguments[0].text.match(/TC-CS\d+-\d+/g) || [];
        if (ids.length !== 1) problem(`CS-${story}: each test must name exactly one full canonical ID`);
        for (const id of ids) { if (!required.includes(id)) problem(`CS-${story}: foreign or unrecorded ID ${id}`); adopted.push(id); }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const id of required) {
    if (adopted.filter(value => value === id).length !== 1) problem(`${id}: expected exactly one executable E2E declaration`);
  }
  if (new Set(required).size !== required.length) problem(`CS-${story}: duplicate recorded IDs`);
  for (const match of record.matchAll(/\]\(([^)]+)\)/g)) {
    if (!/^(https?:|#)/.test(match[1]) && !existsSync(resolve(recordPath, '..', match[1].split('#')[0]))) problem(`CS-${story}: invalid adoption link ${match[1]}`);
  }
  console.log(`CS-${story}: ${required.length} recorded cases, ${adopted.length} executable E2E declarations`);
}
process.exitCode = failed ? 1 : 0;
