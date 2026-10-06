const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewAuthDatabase } = require('./smoke/review-database.cjs');
const project = 'csreview-aryan-ci-unit-fixture';
const config = { name: project, services: { postgres: { ports: [{ target: 5432, published: '35432', host_ip: '127.0.0.1' }] } } };

test('CI-permission-fixture-01: own loopback or Docker Desktop auth database matches the recorded project port', () => {
  for (const host of ['127.0.0.1', 'localhost', 'host.docker.internal']) {
    assert.equal(reviewAuthDatabase(config, project, `postgresql://fixture:fixture@${host}:35432/auth_db`).pathname, '/auth_db');
  }
});

test('CI-permission-fixture-02: foreign project names and a mismatched compose owner are rejected', () => {
  for (const candidate of ['connectsphere', 'shared-production', 'csreview-aryan-ci-other']) {
    assert.throws(() => reviewAuthDatabase(config, candidate, 'postgresql://fixture:fixture@127.0.0.1:35432/auth_db'));
  }
});

test('CI-permission-fixture-03: external hosts, other databases or unrecorded ports are rejected', () => {
  for (const url of ['postgresql://fixture:fixture@db.example.test:35432/auth_db',
    'postgresql://fixture:fixture@127.0.0.1:35432/event_db', 'postgresql://fixture:fixture@127.0.0.1:5432/auth_db']) {
    assert.throws(() => reviewAuthDatabase(config, project, url));
  }
});
