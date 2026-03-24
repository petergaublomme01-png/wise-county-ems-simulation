'use strict';

// Load environment variables FIRST — before any other require that may read them
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const database = require('./db/database');

const app = express();

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

// CORS: allow requests only from the configured frontend origin.
// Set FRONTEND_URL in .env for local dev (http://127.0.0.1:5500)
// and in Railway Variables for production (GitHub Pages URL).
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.use('/api/analyze',   require('./routes/analyze'));
app.use('/api/scenarios', require('./routes/scenarios'));
app.use('/api/travel',    require('./routes/travel'));
app.use('/api/report',    require('./routes/report'));

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── STARTUP ──────────────────────────────────────────────────────────────────

try {
  database.init();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`EMS Backend running on port ${PORT}`);
    console.log(`CORS origin: ${process.env.FRONTEND_URL || '(not set — CORS will block all origins)'}`);
  });
} catch (err) {
  console.error('Failed to start EMS Backend:', err);
  process.exit(1);
}
