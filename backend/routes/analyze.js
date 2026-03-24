'use strict';

/**
 * routes/analyze.js — Claude API proxy
 *
 * POST /api/analyze
 * Proxies analysis requests to the Anthropic Claude API.
 * The API key never leaves the server.
 *
 * Request body:
 *   { mode: 'interpret'|'critique'|'report_paragraph'|'optimize', simulationResults: {...} }
 *
 * Response:
 *   { analysis: string }
 */

const express  = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();

// System prompt: establishes Claude's expert role for all analysis modes
const SYSTEM_PROMPT = `You are an expert EMS deployment analyst with deep knowledge of:
- NFPA 1710 (career fire/EMS departments — 8-minute response time standard for ALS to 90% of incidents)
- NFPA 1720 (volunteer/rural departments — 14-minute total response time standard)
- Rural EMS challenges in Appalachian Virginia, including mountainous terrain, volunteer staffing shortages, and long transport distances
- Mathematical coverage optimization models for emergency services
- The specific geography of Wise County, Virginia (Town of Wise, City of Norton, Town of Big Stone Gap along US-23 and US-58 ALT)

Your responses are factual, specific, and actionable. You cite standards by name when relevant.
Keep responses concise and focused — under 300 words unless the mode specifically requires a formal paragraph.`;

/**
 * Builds a mode-specific user prompt from simulation results.
 * @param {string} mode
 * @param {object} r - simulationResults
 * @returns {string}
 */
function buildUserPrompt(mode, r) {
  // Format zone results into a readable list
  const zoneList = (r.zoneResults || [])
    .map(z => `  - ${z.label} (pop ${z.population}): ${Number(z.minResponseTime).toFixed(1)} min`)
    .join('\n');

  const context = `
Simulation Results for Wise County EMS Deployment:
- Fleet size: ${r.fleetSize} ambulance(s)
- Staging locations: ${(r.stagingConfig || []).join(', ')}
- Time period: ${r.timePeriod}
- Road conditions: ${r.roadConditions}
- Call volume: ${r.callVolume} calls/day
- Day type: ${r.dayType}

Performance Metrics:
- Coverage within 8 min: ${(r.weightedCoverage8 * 100).toFixed(1)}%
- Coverage within 12 min: ${(r.weightedCoverage12 * 100).toFixed(1)}%
- Average response time: ${Number(r.averageResponseTime).toFixed(2)} min
- Worst-case response time: ${Number(r.worstCaseResponseTime).toFixed(1)} min
- Unit availability (utilization approximation): ${(r.availabilityProbability * 100).toFixed(1)}%

Zone-by-zone response times (west to east):
${zoneList}
`.trim();

  const prompts = {
    interpret: `${context}

Explain these EMS deployment results in plain English for a non-technical audience (local government officials or community members).
Specifically highlight:
1. Whether the 8-minute NFPA 1710 target is being met and for which communities
2. Whether the 12-minute maximum response time constraint is satisfied everywhere
3. What this means practically for residents of each zone
Avoid jargon. Be direct about gaps or risks.`,

    critique: `${context}

Identify the 3 most significant weaknesses in this ambulance deployment configuration. For each weakness:
1. Name the specific problem (e.g., a zone with excessive response time)
2. Quantify the impact using the data above
3. Suggest a specific, actionable improvement (e.g., reposition ambulance X to location Y)
Be concrete and reference the actual zone names and response times.`,

    report_paragraph: `${context}

Write a single formal academic paragraph (150-200 words) suitable for a college competition report describing these results.
Requirements:
- Use third person academic tone
- Cite the NFPA 1710 8-minute ALS response standard
- Reference the rural EMS median response time exceeding 14 minutes (Mell et al., 2017, PMC5831456)
- Report the specific coverage percentages and worst-case response time
- Note whether the 12-minute hard constraint is satisfied
- Do not use bullet points or headers — write a single cohesive paragraph`,

    optimize: `${context}

Based on these results, suggest specific parameter changes that would measurably improve EMS coverage while respecting operational constraints.
Include:
1. Recommended staging location changes (use real station names: Wise Rescue Squad, Wise Fire Department, Norton Rescue Squad, Norton Fire Station 1, Big Stone Gap Rescue Squad, Big Stone Gap Fire Department)
2. Whether adding a 3rd unit would be justified based on the current gap analysis
3. Any time-period-specific recommendations (e.g., pre-positioning during snow conditions)
4. Trade-offs of each recommendation (cost, staffing, coverage impact)`
  };

  return prompts[mode] || prompts.interpret;
}

// POST /api/analyze
router.post('/', async (req, res) => {
  try {
    // Validate API key exists
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY is not configured. Set it in backend/.env for local dev or in Railway Variables for production.'
      });
    }

    const { mode, simulationResults } = req.body;

    if (!mode || !simulationResults) {
      return res.status(400).json({ error: 'mode and simulationResults are required' });
    }

    const validModes = ['interpret', 'critique', 'report_paragraph', 'optimize'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: `mode must be one of: ${validModes.join(', ')}` });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserPrompt(mode, simulationResults) }
      ]
    });

    const analysis = message.content[0].text;
    res.json({ analysis });

  } catch (err) {
    console.error('analyze route error:', err);
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
});

module.exports = router;
