const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseCurrentCases } = require('./traceability.cjs');

const root = resolve(__dirname, '../..');
const casesByStory = Object.fromEntries([40, 41, 42, 47].map(story => {
  const record = readFileSync(resolve(root, `tests/records/CS-${story}/test-cases.md`), 'utf8');
  return [story, parseCurrentCases(record)];
}));

test('current records declare Jira-required layers and the requested unit additions', () => {
  const layer = (story, id) => casesByStory[story].find(item => item.id === `TC-CS${story}-${String(id).padStart(2, '0')}`)?.layers ?? [];
  for (const id of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]) assert.ok(layer(40, id).includes('Integration'), `CS-40-${id} must include Integration`);
  assert.ok(layer(40, 2).includes('Unit'), 'CS-40 validation combinations need Unit coverage');
  for (const id of [5, 13]) assert.ok(layer(40, id).includes('E2E'), `CS-40-${id} must include E2E`);
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) assert.ok(layer(41, id).includes('Integration'), `CS-41-${id} must include Integration`);
  for (const id of [2, 3, 7, 9]) assert.ok(layer(41, id).includes('Unit'), `CS-41-${id} needs its Jira-requested Unit check`);
  assert.ok(layer(41, 11).includes('E2E'), 'CS-41-11 must include E2E');
  for (let id = 1; id <= 12; id++) assert.ok(layer(42, id).includes('Integration'), `CS-42-${id} must include Integration`);
  for (const id of [2, 8]) assert.ok(layer(42, id).includes('Unit'), `CS-42-${id} needs its Jira-requested Unit check`);
  for (const id of [1, 2, 4, 5, 6, 7]) assert.ok(layer(47, id).includes('Integration'), `CS-47-${id} must include Integration`);
  for (const id of [3, 7, 9]) assert.ok(layer(47, id).includes('E2E'), `CS-47-${id} must retain browser workflow coverage`);
});

test('every layer declaration has an assertion location and current case IDs are unique', () => {
  for (const [story, cases] of Object.entries(casesByStory)) {
    assert.ok(cases.length > 0, `CS-${story} has a current Jira-aligned table`);
    assert.equal(new Set(cases.map(item => item.id)).size, cases.length, `CS-${story} has duplicate IDs`);
    for (const item of cases) {
      assert.ok(item.assertions.length > 20, `${item.id} needs concrete assertions`);
      for (const layer of item.layers) assert.match(item.layerCell, new RegExp(`\\*\\*${layer}\\*\\*[\\s\\S]*?File: \\x60[^\\x60]+\\x60`), `${item.id} ${layer} needs an assertion file location`);
      assert.match(item.created, /^2026-10-/);
    }
  }
});
