'use strict';

/**
 * routes/travel.js — OpenRouteService driving-time matrix proxy
 *
 * Endpoints:
 *   POST /api/travel/matrix — fetch real driving times between all 6 staging sites
 *   GET  /api/travel/status — check ORS configuration and cache age
 *
 * The 6 staging site coordinates are hardcoded on the server.
 * The ORS API key never reaches the frontend.
 *
 * Note: ORS always returns durations in seconds regardless of any units parameter.
 * The response is converted to minutes (÷ 60) before returning to the client.
 * Do NOT include a "units" field in the ORS request body.
 */

const express = require('express');
const fetch   = require('node-fetch');

const router = express.Router();

// ─── STAGING SITE COORDINATES ─────────────────────────────────────────────────
// Exactly 6 locations in this exact order. Coordinates: [longitude, latitude].
// wise_rescue and wise_fire share the same point (town center), as do the norton
// and bsg pairs — per specification.
const STAGING_COORDINATES = [
  { id: 'wise_rescue',    coords: [-82.5757, 36.9759] },
  { id: 'wise_fire',      coords: [-82.5757, 36.9759] },
  { id: 'norton_rescue',  coords: [-82.6290, 36.9334] },
  { id: 'norton_fire',    coords: [-82.6290, 36.9334] },
  { id: 'bsg_rescue',     coords: [-82.7832, 36.8586] },
  { id: 'bsg_fire',       coords: [-82.7832, 36.8586] }
];

// ─── IN-MEMORY CACHE ──────────────────────────────────────────────────────────
// Refreshed after 24 hours. Resets on server restart (acceptable for this use case).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

let cache = {
  data:        null,   // { matrix, siteIds, retrievedAt }
  retrievedAt: null    // Date.now() timestamp when cache was last populated
};

/**
 * Returns true if the cache is valid (populated and not expired).
 */
function isCacheValid() {
  return cache.data !== null &&
         cache.retrievedAt !== null &&
         (Date.now() - cache.retrievedAt) < CACHE_TTL_MS;
}

/**
 * Fetches the driving-time matrix from OpenRouteService.
 * ORS returns durations in seconds; this function converts them to minutes.
 * @returns {Promise<{ matrix: number[][], siteIds: string[], retrievedAt: string }>}
 */
async function fetchMatrixFromORS() {
  const apiKey = process.env.ORS_API_KEY;

  const response = await fetch(
    'https://api.openrouteservice.org/v2/matrix/driving-car',
    {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type':  'application/json'
      },
      // Only locations and metrics — no units field (ORS always returns seconds)
      body: JSON.stringify({
        locations: STAGING_COORDINATES.map(s => s.coords),
        metrics:   ['duration']
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ORS API error ${response.status}: ${text}`);
  }

  const data = await response.json();

  // data.durations is a 6×6 matrix of seconds — convert to minutes
  const matrixSeconds = data.durations;
  const matrixMinutes = matrixSeconds.map(row =>
    row.map(seconds => Math.round((seconds / 60) * 10) / 10) // 1 decimal place
  );

  return {
    matrix:      matrixMinutes,
    siteIds:     STAGING_COORDINATES.map(s => s.id),
    retrievedAt: new Date().toISOString()
  };
}

// POST /api/travel/matrix — returns 6×6 driving-time matrix in minutes
router.post('/matrix', async (req, res) => {
  try {
    if (!process.env.ORS_API_KEY) {
      return res.status(500).json({
        error: 'ORS_API_KEY is not configured. Set it in backend/.env for local dev or in Railway Variables for production.'
      });
    }

    // Return cached data if still valid
    if (isCacheValid()) {
      return res.json(cache.data);
    }

    // Fetch fresh data from ORS
    const result = await fetchMatrixFromORS();

    // Update cache
    cache.data        = result;
    cache.retrievedAt = Date.now();

    res.json(result);
  } catch (err) {
    console.error('POST /travel/matrix error:', err);
    res.status(500).json({ error: 'Failed to fetch travel matrix: ' + err.message });
  }
});

// GET /api/travel/status — check ORS key configuration and cache freshness
router.get('/status', (req, res) => {
  try {
    const configured = !!process.env.ORS_API_KEY;
    const cacheAge   = cache.retrievedAt !== null
      ? (Date.now() - cache.retrievedAt) / 1000  // age in seconds
      : null;

    res.json({ configured, cacheAge });
  } catch (err) {
    console.error('GET /travel/status error:', err);
    res.status(500).json({ error: 'Failed to get travel status: ' + err.message });
  }
});

module.exports = router;
