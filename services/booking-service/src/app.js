const express = require('express');
const helmet = require('helmet');
const bookings = require('./routes/bookings.routes');
const internal = require('./routes/internal.routes');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '50kb' }));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'booking-service' }));
app.use('/venue-bookings', bookings);
app.use('/internal', internal);
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
