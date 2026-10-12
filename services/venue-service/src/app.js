const express = require('express');
const helmet = require('helmet');
const venues = require('./routes/venues.routes');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '50kb' }));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'venue-service' }));
app.use('/venues', venues);
app.use('/internal',require('./routes/internal.routes'));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err.status && err.status<500) return res.status(err.status).json({error:{code:err.code,message:err.message}});
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
