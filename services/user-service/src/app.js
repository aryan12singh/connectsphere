// Builds the Express app. Kept separate from server.js so the app can be
// started in tests without binding a port.
const express = require('express');
const helmet = require('helmet');
const internalRoutes = require('./routes/internal.routes');

const app = express();

app.use(helmet()); // sensible security headers
app.use(express.json({ limit: '10kb' })); // reject oversized bodies

// Health check for Docker / Kong.
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/internal', internalRoutes);

// Anything else is a 404.
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Last-resort error handler. Express 5 forwards errors thrown inside async
// route handlers here automatically. We log the details but never send them
// to the caller, so stack traces and SQL don't leak.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
