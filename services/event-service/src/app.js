// Event request and event routes implement docs/openapi.yaml. The BFF reaches
// these endpoints through Kong; this service never handles browser cookies.
const express = require('express');
const helmet = require('helmet');
const config = require('./config');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/event-requests', require('./routes/event-requests.routes'));
app.use('/events', require('./routes/events.routes'));
app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (config.dataMode === 'prisma') {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Use a valid JSON object.' } });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body must be at most 10 KB.' } });
    }
    const status = err.status || 500;
    if (status >= 500) console.error('event-service error', err.code || err.name);
    return res.status(status).json({ error: { code: err.code || 'INTERNAL', message: status >= 500 ? 'Unable to process the request. Please retry.' : err.message } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
});

module.exports = app;
