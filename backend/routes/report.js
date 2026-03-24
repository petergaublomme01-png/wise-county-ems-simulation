'use strict';

/**
 * routes/report.js — PDF report generation
 *
 * POST /api/report/generate
 * Generates a formatted competition report PDF and streams it to the browser.
 * Uses PDFKit — no additional table library required.
 *
 * Request body:
 *   {
 *     teamName: string,
 *     scenarios: Array<{ name, params, results }>,
 *     includeMethodology: boolean,
 *     includeSensitivity: boolean,
 *     sensitivityResults: Array<{
 *       parameterName: string,
 *       rangeTested: string,
 *       metricRanges: {
 *         weightedCoverage8:       { min, max },
 *         worstCaseResponseTime:   { min, max },
 *         availabilityProbability: { min, max }
 *       }
 *     }>
 *   }
 */

const express     = require('express');
const PDFDocument = require('pdfkit');

const router = express.Router();

// ─── CITATIONS ────────────────────────────────────────────────────────────────

const CITATIONS = [
  'NFPA 1710 Standard for the Organization and Deployment of Fire Suppression Operations, Emergency Medical Operations, and Special Operations to the Public by Career Fire Departments. National Fire Protection Association.',
  'NFPA 1720 Standard for the Organization and Deployment of Fire Suppression Operations, Emergency Medical Operations, and Special Operations to the Public by Volunteer Fire Departments. National Fire Protection Association.',
  'Mell, H.K., et al. (2017). Emergency Medical Services Response Times in Rural, Suburban, and Urban Areas. JAMA Surgery. PMC5831456.',
  'American College of Surgeons. (2025). EMS Call Times in Rural Areas Take at Least 20 Minutes Longer than National Average. Press Release.',
  'Virginia Department of Fire Programs / VCU. Fire-EMS Funding and Vulnerability Assessment Report, FY21-FY23.',
  'U.S. Census Bureau QuickFacts: Wise County, Virginia. (2024). census.gov/quickfacts/wisecountyvirginia',
  'City of Norton, Virginia. Location Maps and Distance Data. nortonva.gov/170/Location-Maps',
  'Rome2rio. Big Stone Gap to Wise driving distance and time. rome2rio.com'
];

// ─── PDF HELPERS ──────────────────────────────────────────────────────────────

const MARGIN      = 50;
const PAGE_WIDTH  = 612; // US Letter
const PAGE_HEIGHT = 792;
const CONTENT_W   = PAGE_WIDTH - MARGIN * 2;

/**
 * Draws a simple bordered table.
 * @param {PDFDocument} doc
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {number[]} colWidths - must sum to CONTENT_W
 * @param {number} startY
 * @returns {number} Y position after the table
 */
function drawTable(doc, headers, rows, colWidths, startY) {
  const rowHeight  = 20;
  const headerH    = 22;
  const allRows    = [headers, ...rows];
  const heights    = allRows.map((_, i) => i === 0 ? headerH : rowHeight);
  let y = startY;

  allRows.forEach((row, rowIdx) => {
    const h = heights[rowIdx];
    const isHeader = rowIdx === 0;

    if (isHeader) {
      doc.rect(MARGIN, y, CONTENT_W, h).fillAndStroke('#1e293b', '#1e293b');
    } else if (rowIdx % 2 === 0) {
      doc.rect(MARGIN, y, CONTENT_W, h).fillAndStroke('#f8fafc', '#e2e8f0');
    } else {
      doc.rect(MARGIN, y, CONTENT_W, h).fillAndStroke('#ffffff', '#e2e8f0');
    }

    let x = MARGIN;
    row.forEach((cell, colIdx) => {
      const cw = colWidths[colIdx];
      doc
        .fillColor(isHeader ? '#ffffff' : '#1e293b')
        .fontSize(isHeader ? 8 : 8)
        .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .text(String(cell), x + 4, y + (h - 8) / 2, {
          width:    cw - 8,
          ellipsis: true,
          lineBreak: false
        });
      x += cw;
    });

    // Column separator lines
    let cx = MARGIN;
    colWidths.slice(0, -1).forEach(cw => {
      cx += cw;
      doc.moveTo(cx, y).lineTo(cx, y + h).strokeColor('#e2e8f0').stroke();
    });

    y += h;
  });

  // Bottom border
  doc.rect(MARGIN, startY, CONTENT_W, y - startY).stroke('#cbd5e1');

  return y;
}

/**
 * Adds a section heading to the PDF.
 */
function sectionHeading(doc, text) {
  doc.moveDown(0.5);
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f172a').text(text);
  doc.moveDown(0.2);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).strokeColor('#1d6fb8').lineWidth(1.5).stroke();
  doc.moveDown(0.4);
  doc.fontSize(10).font('Helvetica').fillColor('#1e293b');
}

/**
 * Adds a subsection heading.
 */
function subsectionHeading(doc, text) {
  doc.moveDown(0.4);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text(text);
  doc.moveDown(0.2);
  doc.fontSize(10).font('Helvetica').fillColor('#1e293b');
}

/**
 * Returns PASS / WARNING / FAIL based on response time.
 */
function rtStatus(rt) {
  if (rt <= 8)  return 'PASS';
  if (rt <= 12) return 'WARNING';
  return 'FAIL';
}

// ─── ROUTE ────────────────────────────────────────────────────────────────────

// POST /api/report/generate
router.post('/generate', (req, res) => {
  try {
    const {
      teamName           = 'Competition Team',
      scenarios          = [],
      includeMethodology = false,
      includeSensitivity = false,
      sensitivityResults = []
    } = req.body;

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="wise-county-ems-report.pdf"');

    const doc = new PDFDocument({ margin: MARGIN, size: 'LETTER' });
    doc.pipe(res);

    // ── PAGE 1: COVER ────────────────────────────────────────────────────────

    // Vertical center: title block starts at 30% down
    doc.y = PAGE_HEIGHT * 0.28;

    doc.fontSize(22)
       .font('Helvetica-Bold')
       .fillColor('#0f172a')
       .text('Ambulance Deployment Time in', { align: 'center' });

    doc.fontSize(22)
       .text('Wise County, Virginia', { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(14)
       .font('Helvetica')
       .fillColor('#1d6fb8')
       .text('UVA Wise Modeling Competition Spring 2026', { align: 'center' });

    doc.moveDown(2);
    doc.fontSize(12)
       .fillColor('#1e293b')
       .text(teamName, { align: 'center' });

    doc.moveDown(0.5);
    doc.fontSize(11)
       .fillColor('#64748b')
       .text('March 24, 2026', { align: 'center' });

    // Decorative rule
    doc.moveDown(3);
    doc.moveTo(MARGIN + 80, doc.y)
       .lineTo(PAGE_WIDTH - MARGIN - 80, doc.y)
       .strokeColor('#1d6fb8')
       .lineWidth(2)
       .stroke();

    doc.moveDown(1.5);
    doc.fontSize(9)
       .fillColor('#94a3b8')
       .text('Mathematical Simulation Model — Interactive Web Tool', { align: 'center' });

    // ── PAGE 2: METHODOLOGY (optional) ──────────────────────────────────────

    if (includeMethodology) {
      doc.addPage();

      sectionHeading(doc, 'Mathematical Model');

      // Response Time Function
      subsectionHeading(doc, 'Response Time Function');
      doc.text(
        'The response time from an ambulance staging zone to an incident zone is computed as:'
      );
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold')
         .text('  ResponseTime = dispatchTime + turnoutTime + (TravelTime × effectiveRoadMultiplier)');
      doc.font('Helvetica').moveDown(0.3);
      doc.text('Where:');
      doc.text('  • dispatchTime = 1 minute (NFPA 1710 60-second dispatch standard)');
      doc.text('  • turnoutTime = 1 minute (NFPA 1710 60-second turnout benchmark)');
      doc.text('  • TravelTime = baseline driving time between zones (verified research data)');
      doc.text('  • effectiveRoadMultiplier = roadConditionMultiplier × (overnightOverride ?? 1.0)');
      doc.moveDown(0.3);
      doc.text(
        'Demand multipliers and day-type multipliers never affect travel time. Only road condition ' +
        'multipliers and the overnight speed override (0.90×, reflecting reduced traffic) modify TravelTime.'
      );

      // Coverage Objective Function
      subsectionHeading(doc, 'Coverage Objective Function');
      doc.text('For a given staging configuration, coverage is computed as a demand-weighted fraction:');
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold')
         .text('  totalWeightedDemand = Σ (population_i × demandWeight_i)');
      doc.text('  weightedCoverage_T  = Σ [pop_i × dw_i × 𝟙(minRT_i ≤ T)] / totalWeightedDemand');
      doc.font('Helvetica').moveDown(0.3);
      doc.text(
        'where minRT_i is the minimum response time across all staged ambulances to zone i, ' +
        'T is the threshold (8 minutes for NFPA 1710 standard, 12 minutes for the hard constraint), ' +
        'and 𝟙(·) is the indicator function.'
      );

      // Availability Model
      subsectionHeading(doc, 'Availability Model');
      doc.text(
        'Unit availability is estimated using a simplified utilization-based approximation. ' +
        'This is NOT full Erlang-C; it is intentionally simplified for a browser-only interactive tool.'
      );
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold')
         .text('  arrivalRate    = (callsPerDay × demandMultiplier × dayTypeMultiplier) / 24');
      doc.text('  serviceRate    = 60 / busyTimeMinutes  (= 60 / 92.8 ≈ 0.647 calls/hr/unit)');
      doc.text('  activeUnits    = max(1, floor(fleetSize × staffingMultiplier))');
      doc.text('  utilization    = arrivalRate / (activeUnits × serviceRate)');
      doc.text('  availability   = clamp(1 − utilization, 0.05, 0.99)');
      doc.font('Helvetica').moveDown(0.3);
      doc.text(
        'The 92.8-minute rural busy time per call is sourced from the American College of Surgeons ' +
        '(2025), reflecting travel, treatment, hospital handoff, and return to service for mountainous ' +
        'Southwest Virginia terrain.'
      );

      // Data Sources
      subsectionHeading(doc, 'Data Sources');
      CITATIONS.forEach((cite, i) => {
        doc.text(`${i + 1}. ${cite}`, { indent: 15 });
        doc.moveDown(0.2);
      });
    }

    // ── SCENARIO PAGES (one per scenario) ────────────────────────────────────

    const ZONE_ORDER  = ['bsg', 'norton_bsg_corridor', 'norton', 'wise_norton_corridor', 'wise'];
    const ZONE_LABELS = {
      bsg:                  'Big Stone Gap',
      norton_bsg_corridor:  'Norton-BSG Corridor',
      norton:               'Norton',
      wise_norton_corridor: 'Wise-Norton Corridor',
      wise:                 'Wise'
    };

    scenarios.forEach((scenario, idx) => {
      doc.addPage();

      const p = scenario.params  || {};
      const r = scenario.results || {};

      sectionHeading(doc, `Scenario ${idx + 1}: ${scenario.name || 'Unnamed'}`);

      // Parameters summary
      subsectionHeading(doc, 'Scenario Parameters');
      doc.text(`Fleet size:      ${p.fleet || '—'} ambulance(s)`);
      doc.text(`Staging:         ${(p.staging || []).join(', ') || '—'}`);
      doc.text(`Time period:     ${p.timePeriod || '—'}`);
      doc.text(`Road conditions: ${p.roadCondition || '—'}`);
      doc.text(`Call volume:     ${p.callsPerDay || '—'} calls/day`);
      doc.text(`Day type:        ${p.dayType || '—'}`);
      doc.moveDown(0.5);

      // Results table — 5 metrics
      subsectionHeading(doc, 'Performance Results');
      const metricRows = [
        ['Coverage ≤8 min',    ((r.weightedCoverage8  || 0) * 100).toFixed(1) + '%',   r.weightedCoverage8  >= 0.80 ? 'PASS' : r.weightedCoverage8  >= 0.60 ? 'WARNING' : 'FAIL'],
        ['Coverage ≤12 min',   ((r.weightedCoverage12 || 0) * 100).toFixed(1) + '%',   r.weightedCoverage12 >= 0.95 ? 'PASS' : r.weightedCoverage12 >= 0.80 ? 'WARNING' : 'FAIL'],
        ['Avg response time',  Number(r.averageResponseTime   || 0).toFixed(2) + ' min', r.averageResponseTime   <= 8 ? 'PASS' : r.averageResponseTime   <= 12 ? 'WARNING' : 'FAIL'],
        ['Worst-case RT',      Number(r.worstCaseResponseTime || 0).toFixed(1) + ' min', r.worstCaseResponseTime <= 8 ? 'PASS' : r.worstCaseResponseTime <= 12 ? 'WARNING' : 'FAIL'],
        ['Unit availability',  ((r.availabilityProbability || 0) * 100).toFixed(1) + '%', r.availabilityProbability >= 0.80 ? 'PASS' : r.availabilityProbability >= 0.60 ? 'WARNING' : 'FAIL']
      ];

      const metricY = drawTable(
        doc,
        ['Metric', 'Value', 'Status'],
        metricRows,
        [220, 140, CONTENT_W - 360],
        doc.y
      );
      doc.y = metricY + 12;

      // Zone breakdown table
      subsectionHeading(doc, 'Zone Response Time Breakdown (West → East)');
      const zoneResults = r.zoneResults || [];
      const zoneMap = {};
      zoneResults.forEach(z => { zoneMap[z.zoneId] = z; });

      const zoneRows = ZONE_ORDER.map(zid => {
        const z  = zoneMap[zid] || {};
        const rt = z.minResponseTime;
        return [
          ZONE_LABELS[zid] || zid,
          z.population ? z.population.toLocaleString() : '—',
          rt != null ? Number(rt).toFixed(1) + ' min' : '—',
          rt != null ? rtStatus(rt) : '—'
        ];
      });

      const zoneY = drawTable(
        doc,
        ['Zone', 'Population', 'Response Time', 'Status'],
        zoneRows,
        [160, 90, 100, CONTENT_W - 350],
        doc.y
      );
      doc.y = zoneY + 12;

      // Brief interpretation
      subsectionHeading(doc, 'Interpretation');
      const wc8     = ((r.weightedCoverage8  || 0) * 100).toFixed(1);
      const wc12    = ((r.weightedCoverage12 || 0) * 100).toFixed(1);
      const worstRT = Number(r.worstCaseResponseTime || 0).toFixed(1);
      const constraint = (r.worstCaseResponseTime || 99) <= 12;
      doc.text(
        `This ${p.fleet || '?'}-unit deployment achieves ${wc8}% coverage within the NFPA 1710 ` +
        `8-minute standard and ${wc12}% within the 12-minute hard constraint. ` +
        `The worst-case response time is ${worstRT} minutes, which ${constraint ? 'satisfies' : 'VIOLATES'} ` +
        `the 12-minute maximum. ` +
        (constraint
          ? 'All zones receive service within acceptable thresholds under these conditions.'
          : 'Repositioning an ambulance closer to the highest-response-time zone is recommended.')
      );
    });

    // ── SENSITIVITY ANALYSIS SECTION (optional) ──────────────────────────────

    if (includeSensitivity && sensitivityResults && sensitivityResults.length > 0) {
      doc.addPage();

      sectionHeading(doc, 'Sensitivity Analysis');

      doc.text(
        'The following table summarizes how key performance metrics vary as individual parameters ' +
        'are changed across their operational range, with all other parameters held constant at baseline values.'
      );
      doc.moveDown(0.5);

      // Sensitivity table — use sensitivityResults as the authoritative data source
      const sensiRows = sensitivityResults.map(sr => {
        const mr = sr.metricRanges || {};
        const cov8  = mr.weightedCoverage8       || {};
        const worst = mr.worstCaseResponseTime    || {};
        const avail = mr.availabilityProbability  || {};

        const fmt = (v, mult, unit) =>
          (v != null ? (Number(v) * mult).toFixed(1) + unit : '—');

        return [
          sr.parameterName  || '—',
          sr.rangeTested    || '—',
          fmt(cov8.min,  100, '%') + ' – ' + fmt(cov8.max,  100, '%'),
          fmt(worst.min,   1, 'min') + ' – ' + fmt(worst.max,   1, 'min'),
          fmt(avail.min, 100, '%') + ' – ' + fmt(avail.max, 100, '%')
        ];
      });

      const colW = [110, 100, 110, 110, CONTENT_W - 430];
      const sensiY = drawTable(
        doc,
        ['Parameter', 'Range Tested', 'Coverage ≤8min', 'Worst-Case RT', 'Availability'],
        sensiRows,
        colW,
        doc.y
      );
      doc.y = sensiY + 12;

      doc.text(
        'Fleet size has the most significant impact on geographic coverage: increasing from 1 to 2 units ' +
        'eliminates the worst coverage gaps by allowing simultaneous coverage of both ends of the corridor. ' +
        'Road conditions (particularly snow and ice) can push worst-case response times above the 12-minute ' +
        'hard constraint with a 2-unit deployment, supporting a policy of pre-positioning units during winter ' +
        'weather events. Call volume affects unit availability but not response time, meaning surge periods ' +
        'primarily create a risk of unavailability rather than longer response times for units that are available.'
      );
    }

    // ── FINAL PAGE: REFERENCES ────────────────────────────────────────────────

    doc.addPage();
    sectionHeading(doc, 'References');

    CITATIONS.forEach((cite, i) => {
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#1e293b')
         .text(`${i + 1}. ${cite}`, { indent: 20 });
      doc.moveDown(0.4);
    });

    // ── FINALIZE ─────────────────────────────────────────────────────────────
    doc.end();

  } catch (err) {
    console.error('POST /report/generate error:', err);
    // Only send error if headers not yet sent
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF generation failed: ' + err.message });
    }
  }
});

module.exports = router;
