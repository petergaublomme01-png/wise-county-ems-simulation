/**
 * api.js — Wise County EMS Simulation frontend API client
 *
 * Attaches to window.EMS.api as a classic script (no import/export).
 * Communicates with the Node.js/Express backend.
 *
 * The base URL is configurable via window.EMS_API_BASE_URL, which must be
 * defined BEFORE this script loads for production overrides to take effect.
 * To point at a Railway deployment, add this BEFORE the api.js script tag:
 *   <script>window.EMS_API_BASE_URL = 'https://YOUR-RAILWAY-URL.railway.app';</script>
 *
 * Loading order in index.html:
 *   data.js → simulation.js → api.js → inline script
 */

// Define base URL FIRST — allows production override before window.EMS.api is attached.
// Falls back to localhost:3000 for local development.
window.EMS_API_BASE_URL = window.EMS_API_BASE_URL || 'http://localhost:3000';

window.EMS = window.EMS || {};

window.EMS.api = {

  /**
   * Checks whether the backend is reachable.
   * Returns true if the health endpoint responds OK, false on any error.
   * Never throws. Never modifies the DOM — callers handle UI changes.
   *
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      const response = await fetch(window.EMS_API_BASE_URL + '/api/health');
      return response.ok;
    } catch (_err) {
      return false;
    }
  },

  /**
   * Sends simulation results to the Claude API proxy for analysis.
   *
   * @param {'interpret'|'critique'|'report_paragraph'|'optimize'} mode
   * @param {object} simulationResults - Current simulation output from window.EMS.simulation
   * @returns {Promise<string>} Analysis text
   * @throws {Error} on HTTP error or network failure
   */
  async analyze(mode, simulationResults) {
    const response = await fetch(window.EMS_API_BASE_URL + '/api/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mode, simulationResults })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error('Analyze request failed (' + response.status + '): ' + (err.error || response.statusText));
    }
    const data = await response.json();
    return data.analysis;
  },

  /**
   * Saves a named simulation scenario to the backend database.
   *
   * @param {string} name        - Scenario display name
   * @param {string} description - Optional description
   * @param {object} params      - Scenario input parameters
   * @param {object} results     - Simulation output metrics
   * @returns {Promise<object>}  Saved scenario with id
   * @throws {Error} on failure
   */
  async saveScenario(name, description, params, results) {
    const response = await fetch(window.EMS_API_BASE_URL + '/api/scenarios', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, description, params, results })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error('Save scenario failed (' + response.status + '): ' + (err.error || response.statusText));
    }
    return response.json();
  },

  /**
   * Loads all saved scenarios from the backend, ordered newest first.
   *
   * @returns {Promise<object[]>} Array of scenario objects
   * @throws {Error} on failure
   */
  async loadScenarios() {
    const response = await fetch(window.EMS_API_BASE_URL + '/api/scenarios');
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error('Load scenarios failed (' + response.status + '): ' + (err.error || response.statusText));
    }
    return response.json();
  },

  /**
   * Deletes a saved scenario by ID.
   *
   * @param {number|string} id - Scenario ID
   * @returns {Promise<{ deleted: true }>}
   * @throws {Error} on failure
   */
  async deleteScenario(id) {
    const response = await fetch(window.EMS_API_BASE_URL + '/api/scenarios/' + id, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error('Delete scenario failed (' + response.status + '): ' + (err.error || response.statusText));
    }
    return response.json();
  },

  /**
   * Fetches the real driving-time matrix between all 6 staging sites.
   * The backend proxies OpenRouteService and caches the result for 24 hours.
   * Durations are already converted to minutes by the backend.
   *
   * No request body needed — coordinates are hardcoded in the backend.
   *
   * @returns {Promise<{ matrix: number[][], siteIds: string[], retrievedAt: string }>}
   * @throws {Error} on failure
   */
  async getTravelMatrix() {
    const response = await fetch(window.EMS_API_BASE_URL + '/api/travel/matrix', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error('Travel matrix request failed (' + response.status + '): ' + (err.error || response.statusText));
    }
    return response.json();
  },

  /**
   * Generates a PDF competition report and triggers a browser download.
   * Uses the blob + anchor click pattern — no popup blocker issues.
   *
   * @param {string}   teamName           - Team display name for cover page
   * @param {object[]} scenarios          - Array of { name, params, results }
   * @param {boolean}  includeMethodology - Whether to include the methodology section
   * @param {boolean}  includeSensitivity - Whether to include the sensitivity analysis section
   * @param {object[]} sensitivityResults - Required when includeSensitivity is true;
   *                                        authoritative data for the sensitivity table
   * @returns {Promise<boolean>} true on success, false on failure
   */
  async generateReport(teamName, scenarios, includeMethodology, includeSensitivity, sensitivityResults) {
    try {
      const response = await fetch(window.EMS_API_BASE_URL + '/api/report/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          teamName,
          scenarios,
          includeMethodology,
          includeSensitivity,
          sensitivityResults: sensitivityResults || []
        })
      });

      if (!response.ok) {
        console.error('generateReport: server returned', response.status);
        return false;
      }

      // Convert response to blob and trigger browser download
      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'wise-county-ems-report.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Revoke the object URL after a short delay to allow the download to start
      setTimeout(function() { URL.revokeObjectURL(url); }, 10000);

      return true;
    } catch (err) {
      console.error('generateReport error:', err);
      return false;
    }
  }

};
