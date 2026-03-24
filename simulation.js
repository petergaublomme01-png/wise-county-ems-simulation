/**
 * simulation.js — Wise County EMS Simulation
 * Implements the four-component mathematical model:
 *   1. Response time function
 *   2. Coverage objective function
 *   3. Availability model (utilization-based approximation)
 *   4. Optimal staging decision rule
 *
 * Attaches all public functions to window.EMS.simulation.
 * Requires data.js to be loaded first (window.EMS.data must exist).
 * No import/export — classic script tag only.
 */

window.EMS = window.EMS || {};

// ─── PRIVATE HELPER ───────────────────────────────────────────────────────────

/**
 * Generates all combinations with replacement of k items from arr.
 * Recursive call uses index i (not i+1) to allow repetition of the same element.
 *
 * @param {Array} arr - Source array to draw from
 * @param {number} k - Number of items to select
 * @returns {Array[]} Array of combination arrays, each of length k
 *
 * Example: combinationsWithReplacement(['a','b','c'], 2)
 *   → [['a','a'],['a','b'],['a','c'],['b','b'],['b','c'],['c','c']]
 *   Fleet=1→6, Fleet=2→21, Fleet=3→56, Fleet=4→126 combinations.
 */
function combinationsWithReplacement(arr, k) {
  var results = [];
  function helper(start, current) {
    if (current.length === k) {
      results.push(current.slice());
      return;
    }
    for (var i = start; i < arr.length; i++) {
      current.push(arr[i]);
      helper(i, current); // i, not i+1: allows same element again (repetition)
      current.pop();
    }
  }
  helper(0, []);
  return results;
}

/**
 * Clamps a value between min and max (inclusive).
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

window.EMS.simulation = {

  /**
   * @description Computes the effective road multiplier combining road condition
   * and the optional overnight override for the selected time period.
   *
   * @param {string} roadConditionKey - Key into data.ROAD_CONDITIONS
   * @param {string} timePeriodKey    - Key into data.TIME_PERIODS
   * @returns {number} effectiveRoadMultiplier = roadMultiplier × (override ?? 1.0)
   *
   * @math effectiveRoadMultiplier = roadConditionMultiplier × (timePeriod.roadMultiplierOverride ?? 1.0)
   *
   * Note: demand multipliers and day type multipliers NEVER modify travel time.
   * Only road condition multipliers and the overnight override affect travel time.
   */
  computeEffectiveRoadMultiplier: function(roadConditionKey, timePeriodKey) {
    try {
      var data = window.EMS.data;
      var roadMult = data.ROAD_CONDITIONS[roadConditionKey].multiplier;
      var override = data.TIME_PERIODS[timePeriodKey].roadMultiplierOverride;
      return roadMult * (override !== null && override !== undefined ? override : 1.0);
    } catch (e) {
      console.error('computeEffectiveRoadMultiplier error:', e);
      return 1.0; // safe fallback: no adjustment
    }
  },

  /**
   * @description Computes total response time from an ambulance zone to an incident zone.
   *
   * @param {string} ambulanceZoneId  - Zone ID where ambulance is staged
   * @param {string} incidentZoneId   - Zone ID where incident occurs
   * @param {string} roadConditionKey - Key into data.ROAD_CONDITIONS
   * @param {string} timePeriodKey    - Key into data.TIME_PERIODS
   * @returns {number} Response time in minutes; returns 999 on error to prevent NaN cascade
   *
   * @math ResponseTime = dispatchTime + turnoutTime + TravelTime[ambZone][incZone] × effectiveRoadMultiplier
   *       where dispatchTime = 1 min (NFPA 1710), turnoutTime = 1 min (NFPA 1710)
   */
  computeResponseTime: function(ambulanceZoneId, incidentZoneId, roadConditionKey, timePeriodKey) {
    try {
      var data = window.EMS.data;
      var travelTime = data.TRAVEL_TIMES[ambulanceZoneId][incidentZoneId];
      if (travelTime === undefined || travelTime === null) {
        throw new Error('No travel time for ' + ambulanceZoneId + ' → ' + incidentZoneId);
      }
      var mult = window.EMS.simulation.computeEffectiveRoadMultiplier(roadConditionKey, timePeriodKey);
      return data.DISPATCH_TIME + data.TURNOUT_TIME + travelTime * mult;
    } catch (e) {
      console.error('computeResponseTime error:', e);
      return 999; // safe fallback: no silent NaN propagation
    }
  },

  /**
   * @description Computes all coverage objective metrics for a given staging configuration.
   * Resolves each staging site to its parent zone, then for each of the 5 incident zones
   * finds the minimum response time across all staged ambulances.
   *
   * @param {string[]} stagingConfigArray - Array of staging site IDs (length = fleet size)
   * @param {string}   roadConditionKey   - Key into data.ROAD_CONDITIONS
   * @param {string}   timePeriodKey      - Key into data.TIME_PERIODS
   * @returns {{
   *   zoneResults: Array<{zoneId, label, population, minResponseTime, nearestStageSiteId}>,
   *   weightedCoverage8:     number,  // fraction 0–1: weighted pop covered in ≤8 min
   *   weightedCoverage12:    number,  // fraction 0–1: weighted pop covered in ≤12 min
   *   averageResponseTime:   number,  // demand-weighted mean response time (min)
   *   worstCaseResponseTime: number,  // maximum minResponseTime across all zones
   *   totalWeightedDemand:   number   // Σ(population × demandWeight)
   * }|null} Returns null if input is invalid.
   *
   * @math
   *   totalWeightedDemand = Σ_i (zone_i.population × zone_i.demandWeight)
   *   minResponseTime_i   = min_j ResponseTime(ambZone_j, zone_i, road, period)
   *   weightedCoverage8   = Σ_i [pop_i × dw_i × 1(minRT_i ≤ 8)] / totalWeightedDemand
   *   weightedCoverage12  = Σ_i [pop_i × dw_i × 1(minRT_i ≤ 12)] / totalWeightedDemand
   *   averageResponseTime = Σ_i (pop_i × dw_i × minRT_i) / totalWeightedDemand
   *   worstCaseResponseTime = max_i(minRT_i)
   */
  computeCoverageMetrics: function(stagingConfigArray, roadConditionKey, timePeriodKey) {
    try {
      if (!stagingConfigArray || stagingConfigArray.length === 0) {
        return null;
      }
      var data = window.EMS.data;
      var sim  = window.EMS.simulation;

      // Resolve staging site IDs → parent zone IDs
      var ambulanceZones = stagingConfigArray.map(function(siteId) {
        var site = data.STAGING_SITES[siteId];
        if (!site) throw new Error('Unknown staging site: ' + siteId);
        return { siteId: siteId, zoneId: site.zone };
      });

      var totalWeightedDemand = 0;
      var weightedSum8  = 0;
      var weightedSum12 = 0;
      var weightedSumRT = 0;
      var worstRT       = -Infinity;
      var zoneResults   = [];

      data.ZONE_ORDER.forEach(function(zoneId) {
        var zone = data.ZONES[zoneId];
        var weight = zone.population * zone.demandWeight;
        totalWeightedDemand += weight;

        // Find minimum response time and the nearest staging site
        var minRT     = Infinity;
        var nearestId = null;
        ambulanceZones.forEach(function(amb) {
          var rt = sim.computeResponseTime(amb.zoneId, zoneId, roadConditionKey, timePeriodKey);
          if (rt < minRT) {
            minRT     = rt;
            nearestId = amb.siteId;
          }
        });

        if (minRT <= 8)  weightedSum8  += weight;
        if (minRT <= 12) weightedSum12 += weight;
        weightedSumRT += weight * minRT;
        if (minRT > worstRT) worstRT = minRT;

        zoneResults.push({
          zoneId:            zoneId,
          label:             zone.label,
          population:        zone.population,
          minResponseTime:   minRT,
          nearestStageSiteId: nearestId
        });
      });

      return {
        zoneResults:           zoneResults,
        weightedCoverage8:     weightedSum8  / totalWeightedDemand,
        weightedCoverage12:    weightedSum12 / totalWeightedDemand,
        averageResponseTime:   weightedSumRT / totalWeightedDemand,
        worstCaseResponseTime: worstRT,
        totalWeightedDemand:   totalWeightedDemand
      };
    } catch (e) {
      console.error('computeCoverageMetrics error:', e);
      return null;
    }
  },

  /**
   * @description Computes ambulance availability probability using a utilization-based
   * approximation. This is intentionally simplified for a browser-only single-file app.
   * It is NOT full Erlang-C (which requires iterative computation and queue assumptions).
   *
   * @param {number} fleetSize      - Total number of ambulances
   * @param {string} timePeriodKey  - Key into data.TIME_PERIODS
   * @param {string} dayTypeKey     - Key into data.DAY_TYPES
   * @param {number} callsPerDay    - Call volume per day
   * @returns {number} Estimated probability that at least one unit is available (0.05–0.99)
   *
   * @math
   *   // Utilization-based approximation — intentionally simplified for browser-only app.
   *   // Not full Erlang-C.
   *   effectiveDemandMultiplier = timePeriod.demandMultiplier × dayType.dayTypeMultiplier
   *   arrivalRatePerHour        = (callsPerDay × effectiveDemandMultiplier) / 24
   *   serviceRatePerHour        = 60 / busyTimeMinutes
   *   activeAmbulances          = max(1, floor(fleetSize × timePeriod.staffingMultiplier))
   *   utilization               = arrivalRatePerHour / (activeAmbulances × serviceRatePerHour)
   *   availabilityProbability   = clamp(1 − utilization, 0.05, 0.99)
   */
  computeAvailability: function(fleetSize, timePeriodKey, dayTypeKey, callsPerDay) {
    try {
      var data   = window.EMS.data;
      var period = data.TIME_PERIODS[timePeriodKey];
      var day    = data.DAY_TYPES[dayTypeKey];

      // Effective demand multiplier combines time-of-day and day-type factors
      var effectiveDemandMult = period.demandMultiplier * day.dayTypeMultiplier;

      // Arrival rate in calls per hour
      var arrivalRatePerHour = (callsPerDay * effectiveDemandMult) / 24;

      // Service rate: each ambulance completes 60/92.8 ≈ 0.647 calls per hour
      var serviceRatePerHour = 60 / data.BUSY_TIME_MINUTES; // = 0.6466.../hr

      // Active ambulances staffed during this time period (floor, min 1)
      var activeAmbulances = Math.max(1, Math.floor(fleetSize * period.staffingMultiplier));

      // System utilization: fraction of server capacity consumed by demand
      var utilization = arrivalRatePerHour / (activeAmbulances * serviceRatePerHour);

      // Availability approximation: clamped to [0.05, 0.99] to keep display sensible
      return clamp(1 - utilization, 0.05, 0.99);
    } catch (e) {
      console.error('computeAvailability error:', e);
      return 0.5; // safe fallback
    }
  },

  /**
   * @description Finds the optimal ambulance staging configuration for a given scenario
   * by enumerating all combinations-with-replacement of fleet size staging sites
   * and applying a four-level priority rule.
   *
   * @param {number} fleetSize      - Number of ambulances to stage (1–4)
   * @param {string} timePeriodKey  - Key into data.TIME_PERIODS
   * @param {string} roadConditionKey - Key into data.ROAD_CONDITIONS
   * @param {string} dayTypeKey     - Key into data.DAY_TYPES
   * @param {number} callsPerDay    - Call volume per day
   * @returns {{ stagingConfig: string[], metrics: object }|null}
   *
   * @math Priority rule (applied in order):
   *   1. Prefer configurations where worstCaseResponseTime ≤ 12 (hard constraint)
   *   2. Among those, maximize weightedCoverage8
   *   3. Break ties: minimize averageResponseTime
   *   4. If no config satisfies ≤12: minimize worstCaseResponseTime, then maximize wc8
   */
  findOptimalStaging: function(fleetSize, timePeriodKey, roadConditionKey, dayTypeKey, callsPerDay) {
    try {
      var data    = window.EMS.data;
      var sim     = window.EMS.simulation;
      var siteIds = Object.keys(data.STAGING_SITES);

      // Generate all combinations-with-replacement
      var combos = combinationsWithReplacement(siteIds, fleetSize);

      var bestConfig  = null;
      var bestMetrics = null;

      combos.forEach(function(combo) {
        var metrics = sim.computeCoverageMetrics(combo, roadConditionKey, timePeriodKey);
        if (!metrics) return;

        if (!bestConfig) {
          bestConfig  = combo;
          bestMetrics = metrics;
          return;
        }

        // Four-level priority comparison
        var cSatisfies = bestMetrics.worstCaseResponseTime <= 12;
        var nSatisfies = metrics.worstCaseResponseTime     <= 12;

        if (nSatisfies && !cSatisfies) {
          // Candidate satisfies constraint, current does not → take candidate
          bestConfig  = combo;
          bestMetrics = metrics;
        } else if (!nSatisfies && cSatisfies) {
          // Current satisfies, candidate does not → keep current
          // (no-op)
        } else if (nSatisfies && cSatisfies) {
          // Both satisfy constraint: prefer higher wc8, then lower avgRT
          if (metrics.weightedCoverage8 > bestMetrics.weightedCoverage8) {
            bestConfig  = combo;
            bestMetrics = metrics;
          } else if (
            metrics.weightedCoverage8 === bestMetrics.weightedCoverage8 &&
            metrics.averageResponseTime < bestMetrics.averageResponseTime
          ) {
            bestConfig  = combo;
            bestMetrics = metrics;
          }
        } else {
          // Neither satisfies constraint: minimize worstCase, then maximize wc8
          if (metrics.worstCaseResponseTime < bestMetrics.worstCaseResponseTime) {
            bestConfig  = combo;
            bestMetrics = metrics;
          } else if (
            metrics.worstCaseResponseTime === bestMetrics.worstCaseResponseTime &&
            metrics.weightedCoverage8 > bestMetrics.weightedCoverage8
          ) {
            bestConfig  = combo;
            bestMetrics = metrics;
          }
        }
      });

      if (!bestConfig) return null;
      return { stagingConfig: bestConfig, metrics: bestMetrics };
    } catch (e) {
      console.error('findOptimalStaging error:', e);
      return null;
    }
  },

  /**
   * @description Runs a one-dimensional sensitivity analysis by varying one parameter
   * across a predefined range while holding all others constant at provided values.
   *
   * For 'callVolume': call volume does NOT affect response time metrics (road travel
   * time is independent of demand). This analysis instead shows how unit availability
   * changes with call volume — the relevant operational implication for deployment.
   * coverage8Data contains availability values; worstCaseData contains utilization.
   *
   * For 'timeOfDay': response time coverage varies minimally between periods (only
   * overnight has a road multiplier override). Availability varies dramatically.
   * coverage8Data contains wc8; worstCaseData contains availability per period.
   *
   * @param {string} paramKey           - 'fleetSize'|'roadConditions'|'callVolume'|'timeOfDay'
   * @param {number} fleetSize          - Current fleet size (held constant unless paramKey='fleetSize')
   * @param {string} timePeriodKey      - Current time period
   * @param {string} roadConditionKey   - Current road condition
   * @param {string} dayTypeKey         - Current day type
   * @param {number} callsPerDay        - Current call volume
   * @returns {{
   *   labels:        string[],
   *   coverage8Data: number[],
   *   worstCaseData: number[],
   *   yLabel:        string,
   *   y1Label:       string,
   *   interpretation: string
   * }|null}
   */
  runSensitivityAnalysis: function(paramKey, fleetSize, timePeriodKey, roadConditionKey, dayTypeKey, callsPerDay) {
    try {
      var sim  = window.EMS.simulation;
      var data = window.EMS.data;

      var labels        = [];
      var coverage8Data = [];
      var worstCaseData = [];
      var yLabel        = '';
      var y1Label       = '';
      var interpretation = '';

      if (paramKey === 'fleetSize') {
        // Vary fleet size 1–4, use optimal staging for each
        yLabel  = 'Coverage ≤8 min (%)';
        y1Label = 'Worst-case response time (min)';
        [1, 2, 3, 4].forEach(function(fs) {
          var result = sim.findOptimalStaging(fs, timePeriodKey, roadConditionKey, dayTypeKey, callsPerDay);
          if (result) {
            labels.push(fs + ' unit' + (fs > 1 ? 's' : ''));
            coverage8Data.push(+(result.metrics.weightedCoverage8 * 100).toFixed(1));
            worstCaseData.push(+result.metrics.worstCaseResponseTime.toFixed(1));
          }
        });
        interpretation =
          'Increasing fleet size from 1 to 2 units produces the largest gain in coverage: a single unit ' +
          'cannot simultaneously serve both ends of the county. A third unit achieves near-complete ' +
          '8-minute coverage by addressing the Wise zone gap. A fourth unit provides redundancy but ' +
          'diminishing geographic returns, making it most valuable for availability rather than coverage.';

      } else if (paramKey === 'roadConditions') {
        // Vary road conditions across all 5 levels, use current fleet/staging
        yLabel  = 'Coverage ≤8 min (%)';
        y1Label = 'Worst-case response time (min)';
        var roadKeys = Object.keys(data.ROAD_CONDITIONS);
        roadKeys.forEach(function(rk) {
          var result = sim.findOptimalStaging(fleetSize, timePeriodKey, rk, dayTypeKey, callsPerDay);
          if (result) {
            labels.push(data.ROAD_CONDITIONS[rk].label);
            coverage8Data.push(+(result.metrics.weightedCoverage8 * 100).toFixed(1));
            worstCaseData.push(+result.metrics.worstCaseResponseTime.toFixed(1));
          }
        });
        interpretation =
          'Road conditions have a significant impact on coverage, particularly for zones far from staging ' +
          'sites. Snow and ice (1.56× travel time) can push the Wise zone response above 12 minutes with ' +
          'a 2-unit deployment, violating the hard constraint. Pre-positioning an ambulance in Wise during ' +
          'winter storm events is strongly recommended based on this analysis.';

      } else if (paramKey === 'callVolume') {
        // Call volume does not affect response time — show availability vs. utilization instead
        yLabel  = 'Unit availability (%)';
        y1Label = 'System utilization (%)';
        var volumes = [10, 15, 20, 24.5, 28, 32, 36, 42];
        volumes.forEach(function(vol) {
          var avail = sim.computeAvailability(fleetSize, timePeriodKey, dayTypeKey, vol);
          var period = data.TIME_PERIODS[timePeriodKey];
          var day    = data.DAY_TYPES[dayTypeKey];
          var effDem = period.demandMultiplier * day.dayTypeMultiplier;
          var arrRate = (vol * effDem) / 24;
          var svcRate = 60 / data.BUSY_TIME_MINUTES;
          var activeAmbs = Math.max(1, Math.floor(fleetSize * period.staffingMultiplier));
          var util = arrRate / (activeAmbs * svcRate);
          labels.push(vol + '/day');
          coverage8Data.push(+(avail * 100).toFixed(1));
          worstCaseData.push(+(Math.min(util * 100, 150)).toFixed(1));
        });
        interpretation =
          'Note: call volume does not affect response time — travel distance is fixed regardless of demand. ' +
          'This chart shows how unit availability (probability a unit is free) degrades as call volume rises. ' +
          'At the current ' + fleetSize + '-unit deployment, surge conditions (35+ calls/day) push utilization ' +
          'above 100%, meaning units are statistically always busy and mutual aid from neighboring counties ' +
          'becomes essential.';

      } else if (paramKey === 'timeOfDay') {
        // Vary time of day — show both wc8 coverage and availability
        yLabel  = 'Coverage ≤8 min (%)';
        y1Label = 'Unit availability (%)';
        var periodKeys = Object.keys(data.TIME_PERIODS);
        periodKeys.forEach(function(pk) {
          var result = sim.findOptimalStaging(fleetSize, pk, roadConditionKey, dayTypeKey, callsPerDay);
          var avail  = sim.computeAvailability(fleetSize, pk, dayTypeKey, callsPerDay);
          if (result) {
            labels.push(data.TIME_PERIODS[pk].label.split(' ')[0]); // short label
            coverage8Data.push(+(result.metrics.weightedCoverage8 * 100).toFixed(1));
            worstCaseData.push(+(avail * 100).toFixed(1));
          }
        });
        interpretation =
          'Response time coverage is nearly identical across all time periods because road travel times ' +
          'change minimally (overnight is slightly faster due to reduced traffic). However, unit availability ' +
          'varies dramatically: overnight staffing reductions combined with persistent call demand create the ' +
          'highest utilization during morning hours. Overnight calls are fewer but units are also fewer, so ' +
          'availability actually improves overnight despite reduced staffing.';
      }

      return {
        labels:         labels,
        coverage8Data:  coverage8Data,
        worstCaseData:  worstCaseData,
        yLabel:         yLabel,
        y1Label:        y1Label,
        interpretation: interpretation
      };
    } catch (e) {
      console.error('runSensitivityAnalysis error:', e);
      return null;
    }
  }

};
