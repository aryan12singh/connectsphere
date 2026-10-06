// Builds the Express app. Sprint 2 scaffold: only the health check exists.
// Routes are added by the stories that implement them — see
// venue-service/docs/openapi.yaml for the agreed contract.
const express = require('express');
const helmet = require('helmet');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Not implemented yet: the contract is agreed, the handlers are not built.
app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
});

module.exports = app;
