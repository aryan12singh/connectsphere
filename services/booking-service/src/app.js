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
  if (err.status && err.status < 500) return res.status(err.status).json({error:{code:err.code,message:err.message,...(err.fields?{fields:err.fields}:{}),...(err.details || {})}});
  if (err.status===503) return res.status(503).json({error:{code:err.code || 'UPSTREAM_UNAVAILABLE',message:err.message}});
  console.error('booking-service error',err.code || err.name);
  res.status(500).json({ error: {code:'INTERNAL',message:'Unable to process the booking. Please retry.'} });
});

module.exports = app;
