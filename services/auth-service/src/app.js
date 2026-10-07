// Builds the Express app. Kept separate from server.js so the app can be
// started in tests without binding a port.
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const internalRoutes = require('./routes/internal.routes');

const app = express();

app.use(helmet()); // sensible security headers
app.use(express.json({ limit: '10kb' })); // reject oversized bodies

// Tokens and user details must never be cached by browsers or proxies.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Health check for Docker / Kong.
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Swagger UI at /docs (reachable on the service port, not through Kong).
const openapi = YAML.parse(fs.readFileSync(path.join(__dirname, '../docs/openapi.yaml'), 'utf8'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/internal', internalRoutes);

// Anything else is a 404.
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Last-resort error handler. Express 5 forwards errors thrown inside async
// route handlers here automatically. Details go to the log, never to the
// caller.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Malformed or oversized JSON body.
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  // Input rejected by Keycloak or user-service (weak password, email taken,
  // user not found...). These messages are written for the admin to read.
  if (err.status >= 400 && err.status < 500) {
    const fields = err.fields || (err.status === 409 ? { email: [err.message] } : err.status === 400 ? { password: [err.message] } : undefined);
    return res.status(err.status).json({ error: fields ? { code: 'VALIDATION_ERROR', message: err.message, fields } : err.message });
  }
  // Keycloak or user-service unreachable / timed out.
  if (err.name === 'TimeoutError' || err.message === 'fetch failed') {
    console.error('Dependency unavailable:', err.message);
    return res.status(503).json({ error: 'A required service is unavailable. Please try again shortly.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
