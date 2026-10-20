const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/internal/events/:eventId/readiness', (req, res, next) => {
  if (req.get('x-internal-api-key') !== require('./config').internalApiKey) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Internal credential required.' } });
  require('./readiness').current(req.params.eventId).then(value => res.json(value), next);
});
app.post('/internal/events/:eventId/readiness/prepare', (req, res, next) => {
  if (req.get('x-internal-api-key') !== require('./config').internalApiKey) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Internal credential required.' } });
  require('./readiness').prepare(req.params.eventId, req.body || {}).then(value => res.json(value), next);
});
app.post('/internal/events/:eventId/readiness/release', (req, res, next) => {
  if (req.get('x-internal-api-key') !== require('./config').internalApiKey) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Internal credential required.' } });
  require('./readiness').release(req.params.eventId, req.body?.token).then(value => res.json(value), next);
});
app.use('/', require('./routes/technical-requests'));
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Use a valid JSON object.' } });
  const status = err.status || 500;
  if (status >= 500) console.error('equipment-service error', err.code || err.name);
  return res.status(status).json({ error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Unable to process the request. Please retry.' : err.message } });
});

module.exports = app;
