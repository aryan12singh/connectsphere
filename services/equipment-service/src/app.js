const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/internal',require('./routes/internal'));
app.use('/', require('./routes/technical-requests'));
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Use a valid JSON object.' } });
  const status = err.status || 500;
  if (status >= 500) console.error('equipment-service error', err.code || err.name);
  return res.status(status).json({ error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Unable to process the request. Please retry.' : err.message, ...(err.shortfalls?{shortfalls:err.shortfalls}:{}) } });
});

module.exports = app;
