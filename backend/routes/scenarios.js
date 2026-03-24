'use strict';

/**
 * routes/scenarios.js — Scenario persistence (SQLite CRUD via sqlite3)
 *
 * Endpoints:
 *   GET    /api/scenarios       — list all saved scenarios
 *   POST   /api/scenarios       — save a new scenario
 *   GET    /api/scenarios/:id   — retrieve one scenario
 *   DELETE /api/scenarios/:id   — delete a scenario
 *
 * All handlers are async and use the Promise helpers exported from database.js:
 *   dbRun(sql, params) → { lastID, changes }
 *   dbGet(sql, params) → row object | undefined
 *   dbAll(sql, params) → row object[]
 *
 * sqlite3 writes directly to the file on every statement — no manual saveDb() call needed.
 *
 * The params and results fields are stored as JSON strings in SQLite
 * and parsed back to objects before returning to the client.
 */

const express               = require('express');
const { dbRun, dbGet, dbAll } = require('../db/database');

const router = express.Router();

/**
 * Parses the params and results JSON strings on a raw database row.
 * Returns a new object with parsed fields.
 */
function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    params:  JSON.parse(row.params),
    results: JSON.parse(row.results)
  };
}

// GET /api/scenarios — list all, newest first
router.get('/', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM scenarios ORDER BY created_at DESC', []);
    res.json(rows.map(parseRow));
  } catch (err) {
    console.error('GET /scenarios error:', err);
    res.status(500).json({ error: 'Failed to retrieve scenarios: ' + err.message });
  }
});

// POST /api/scenarios — save a new scenario
router.post('/', async (req, res) => {
  try {
    const { name, description, params, results } = req.body;

    if (!name || !params) {
      return res.status(400).json({ error: 'name and params are required' });
    }

    // dbRun returns { lastID, changes } — lastID is the new row's id
    const info = await dbRun(
      'INSERT INTO scenarios (name, description, params, results) VALUES (?, ?, ?, ?)',
      [name, description || null, JSON.stringify(params), JSON.stringify(results || {})]
    );

    // Read back the created row to return the full object including created_at
    const created = await dbGet('SELECT * FROM scenarios WHERE id = ?', [info.lastID]);
    res.status(201).json(parseRow(created));
  } catch (err) {
    console.error('POST /scenarios error:', err);
    res.status(500).json({ error: 'Failed to save scenario: ' + err.message });
  }
});

// GET /api/scenarios/:id — retrieve one scenario
router.get('/:id', async (req, res) => {
  try {
    // sqlite3 dbGet returns undefined (not {}) when no row is found
    const row = await dbGet('SELECT * FROM scenarios WHERE id = ?', [req.params.id]);

    if (!row) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    res.json(parseRow(row));
  } catch (err) {
    console.error('GET /scenarios/:id error:', err);
    res.status(500).json({ error: 'Failed to retrieve scenario: ' + err.message });
  }
});

// DELETE /api/scenarios/:id — delete a scenario
router.delete('/:id', async (req, res) => {
  try {
    // dbRun returns { lastID, changes } — changes is 0 if no row was deleted
    const info = await dbRun('DELETE FROM scenarios WHERE id = ?', [req.params.id]);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /scenarios/:id error:', err);
    res.status(500).json({ error: 'Failed to delete scenario: ' + err.message });
  }
});

module.exports = router;
