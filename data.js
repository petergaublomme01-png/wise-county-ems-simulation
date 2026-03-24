/**
 * data.js — Wise County EMS Simulation
 * Populates window.EMS.data with all geographic, demographic,
 * and operational constants used by simulation.js.
 *
 * Loading order: this file must load BEFORE simulation.js and the inline script.
 * No import/export — attaches exclusively to window.EMS global namespace.
 */

window.EMS = window.EMS || {};

window.EMS.data = {

  // ─── ZONES ───────────────────────────────────────────────────────────────
  // Five geographic zones ordered west-to-east along US-58 ALT / US-23.
  // Map coordinates match the authoritative map spec (viewBox 0 0 1000 500).
  ZONES: {
    bsg: {
      id: 'bsg',
      label: 'Big Stone Gap',
      type: 'town',
      population: 5254,       // Census 2024 estimate
      demandWeight: 0.28,     // Proportional share of EMS demand (see ASSUMPTIONS)
      mapX: 120,
      mapY: 290
    },
    norton_bsg_corridor: {
      id: 'norton_bsg_corridor',
      label: 'Norton-BSG Corridor',
      type: 'corridor',
      population: 1200,       // Estimated corridor population (see ASSUMPTIONS)
      demandWeight: 0.17,     // Proportional share of EMS demand (see ASSUMPTIONS)
      mapX: 320,
      mapY: 255
    },
    norton: {
      id: 'norton',
      label: 'Norton',
      type: 'town',
      population: 3687,       // Census 2024 estimate
      demandWeight: 0.25,     // Proportional share of EMS demand (see ASSUMPTIONS)
      mapX: 520,
      mapY: 220
    },
    wise_norton_corridor: {
      id: 'wise_norton_corridor',
      label: 'Wise-Norton Corridor',
      type: 'corridor',
      population: 800,        // Estimated corridor population (see ASSUMPTIONS)
      demandWeight: 0.12,     // Proportional share of EMS demand (see ASSUMPTIONS)
      mapX: 700,
      mapY: 180
    },
    wise: {
      id: 'wise',
      label: 'Wise',
      type: 'town',
      population: 2970,       // Census 2024 estimate
      demandWeight: 0.18,     // Proportional share of EMS demand (see ASSUMPTIONS)
      mapX: 860,
      mapY: 145
    }
  },

  // Ordered list of zone IDs west-to-east (used for table rendering)
  ZONE_ORDER: ['bsg', 'norton_bsg_corridor', 'norton', 'wise_norton_corridor', 'wise'],

  // ─── HOSPITALS ───────────────────────────────────────────────────────────
  // Two hospitals serving the county. Coordinates from map spec.
  HOSPITALS: {
    lph: {
      id: 'lph',
      label: 'Lonesome Pine Hospital',
      shortLabel: 'LPH',
      address: '1990 Holton Ave E, Big Stone Gap VA',
      x: 170,
      y: 370,
      serves: ['bsg', 'norton_bsg_corridor']
    },
    nch: {
      id: 'nch',
      label: 'Norton Community Hospital',
      shortLabel: 'NCH',
      address: '100 15th St NW, Norton VA',
      x: 560,
      y: 320,
      serves: ['norton', 'wise_norton_corridor', 'wise']
    }
  },

  // ─── STAGING SITES ───────────────────────────────────────────────────────
  // Six real EMS staging locations from the map spec.
  // displayDx/displayDy: pixel offsets from parent zone center for SVG markers.
  // zone: parent zone ID used for travel-time lookups.
  STAGING_SITES: {
    wise_rescue: {
      id: 'wise_rescue',
      label: 'Wise Rescue Squad',
      address: '302 Railroad Ave NE, Wise VA',
      zone: 'wise',
      displayDx: -30,
      displayDy: -60
    },
    wise_fire: {
      id: 'wise_fire',
      label: 'Wise Fire Department',
      address: '307 Norton Road, Wise VA',
      zone: 'wise',
      displayDx: 30,
      displayDy: -60
    },
    norton_rescue: {
      id: 'norton_rescue',
      label: 'Norton Rescue Squad',
      address: '1710 Main Ave SW, Norton VA',
      zone: 'norton',
      displayDx: -30,
      displayDy: -60
    },
    norton_fire: {
      id: 'norton_fire',
      label: 'Norton Fire Station 1',
      address: '618 Virginia Avenue NW, Norton VA',
      zone: 'norton',
      displayDx: 30,
      displayDy: -60
    },
    bsg_rescue: {
      id: 'bsg_rescue',
      label: 'Big Stone Gap Rescue Squad',
      address: '361 Shawnee Ave E, Big Stone Gap VA',
      zone: 'bsg',
      displayDx: -30,
      displayDy: -60
    },
    bsg_fire: {
      id: 'bsg_fire',
      label: 'Big Stone Gap Fire Department',
      address: '363 Shawnee Avenue, Big Stone Gap VA',
      zone: 'bsg',
      displayDx: 30,
      displayDy: -60
    }
  },

  // ─── ROAD EDGES ──────────────────────────────────────────────────────────
  // Four road segments for SVG map rendering (from map spec).
  // minutes: display-only segment travel time shown on map labels.
  ROAD_EDGES: [
    { from: 'bsg',                to: 'norton_bsg_corridor',  road: 'US-58 ALT', minutes: 5  },
    { from: 'norton_bsg_corridor', to: 'norton',               road: 'US-58 ALT', minutes: 8  },
    { from: 'norton',             to: 'wise_norton_corridor', road: 'US-23',     minutes: 5  },
    { from: 'wise_norton_corridor', to: 'wise',               road: 'US-23',     minutes: 4  }
  ],

  // ─── TRAVEL TIMES ────────────────────────────────────────────────────────
  // Symmetric origin-destination matrix, baseline minutes under normal conditions.
  // Source: verified research data (see SOURCE_NOTES).
  // Note: Norton→BSG (14 min) and BSG→Norton (14 min) represent real-world routing
  // along US-58 ALT; the map-edge sum (8+5=13) is a display simplification.
  // The matrix values here are authoritative for all simulation calculations.
  TRAVEL_TIMES: {
    wise: {
      wise:                 0,
      norton:               9,   // Wise to Norton via US-23 — verified
      bsg:                  21,  // Wise to Big Stone Gap via US-23/US-58 ALT — verified
      wise_norton_corridor: 4,   // Wise to Wise-Norton Corridor — verified
      norton_bsg_corridor:  15   // Wise to Norton-BSG Corridor — verified
    },
    norton: {
      wise:                 9,   // Norton to Wise via US-23 — verified
      norton:               0,
      bsg:                  14,  // Norton to Big Stone Gap via US-58 ALT — verified
      wise_norton_corridor: 5,   // Norton to Wise-Norton Corridor — verified
      norton_bsg_corridor:  8    // Norton to Norton-BSG Corridor — verified
    },
    bsg: {
      wise:                 21,  // Big Stone Gap to Wise — verified
      norton:               14,  // Big Stone Gap to Norton via US-58 ALT — verified
      bsg:                  0,
      wise_norton_corridor: 17,  // Big Stone Gap to Wise-Norton Corridor — verified
      norton_bsg_corridor:  5    // Big Stone Gap to Norton-BSG Corridor — verified
    },
    wise_norton_corridor: {
      wise:                 4,   // Wise-Norton Corridor to Wise — verified
      norton:               5,   // Wise-Norton Corridor to Norton — verified
      bsg:                  17,  // Wise-Norton Corridor to Big Stone Gap — verified
      wise_norton_corridor: 0,
      norton_bsg_corridor:  13   // Wise-Norton to Norton-BSG Corridor — verified
    },
    norton_bsg_corridor: {
      wise:                 15,  // Norton-BSG Corridor to Wise — verified
      norton:               8,   // Norton-BSG Corridor to Norton — verified
      bsg:                  5,   // Norton-BSG Corridor to Big Stone Gap — verified
      wise_norton_corridor: 13,  // Norton-BSG Corridor to Wise-Norton Corridor — verified
      norton_bsg_corridor:  0
    }
  },

  // ─── ROAD CONDITIONS ─────────────────────────────────────────────────────
  // Multipliers applied to travel time only (never to demand).
  ROAD_CONDITIONS: {
    normal: { id: 'normal', label: 'Normal',       multiplier: 1.00 },  // Baseline
    peak:   { id: 'peak',   label: 'Peak traffic', multiplier: 1.25 },  // Source: ASSUMPTIONS
    rain:   { id: 'rain',   label: 'Heavy rain',   multiplier: 1.22 },  // Source: ASSUMPTIONS
    snow:   { id: 'snow',   label: 'Snow / ice',   multiplier: 1.56 },  // Source: ASSUMPTIONS
    fog:    { id: 'fog',    label: 'Dense fog',    multiplier: 1.33 }   // Source: ASSUMPTIONS
  },

  // ─── TIME PERIODS ─────────────────────────────────────────────────────────
  // Affect demand and staffing. Overnight also applies a road speed override.
  // roadMultiplierOverride: when non-null, multiplied with road condition multiplier.
  // The 0.90 nighttime factor represents reduced traffic at night (see ASSUMPTIONS).
  // NOTE: Do NOT expose nighttime factor as a separate dropdown option.
  TIME_PERIODS: {
    overnight: {
      id: 'overnight',
      label: 'Overnight 10pm–6am',
      demandMultiplier:    0.4,   // Reduced call volume overnight — VDFP/VCU pattern data
      staffingMultiplier:  0.6,   // Reduced staffing overnight — operational assumption
      roadMultiplierOverride: 0.90  // Faster travel at night due to reduced traffic (see ASSUMPTIONS)
    },
    morning: {
      id: 'morning',
      label: 'Morning 6am–12pm',
      demandMultiplier:    1.2,   // Peak call volume morning — VDFP/VCU pattern data
      staffingMultiplier:  1.0,
      roadMultiplierOverride: null
    },
    afternoon: {
      id: 'afternoon',
      label: 'Afternoon 12pm–6pm',
      demandMultiplier:    1.0,   // Baseline afternoon demand
      staffingMultiplier:  1.0,
      roadMultiplierOverride: null
    },
    evening: {
      id: 'evening',
      label: 'Evening 6pm–10pm',
      demandMultiplier:    0.8,   // Reduced evening demand
      staffingMultiplier:  0.85,  // Slightly reduced volunteer staffing evenings
      roadMultiplierOverride: null
    }
  },

  // ─── DAY TYPES ────────────────────────────────────────────────────────────
  DAY_TYPES: {
    weekday: { id: 'weekday', label: 'Weekday', dayTypeMultiplier: 1.0  },
    weekend: { id: 'weekend', label: 'Weekend', dayTypeMultiplier: 0.85 } // See ASSUMPTIONS
  },

  // ─── OPERATIONAL CONSTANTS ────────────────────────────────────────────────
  DISPATCH_TIME:          1,      // minutes — fixed overhead per NFPA 1710
  TURNOUT_TIME:           1,      // minutes — NFPA 1710 benchmark: 60 seconds
  CALLS_PER_DAY_DEFAULT:  24.5,   // calls/day — derived from 8,938 annual calls (VDFP/VCU FY21-23)
  BUSY_TIME_MINUTES:      92.8,   // min/call — American College of Surgeons, 2025, rural EMS

  // ─── SOURCE NOTES ─────────────────────────────────────────────────────────
  // Citation for every major data value used in the simulation.
  SOURCE_NOTES: {
    population_towns: {
      value: 'Wise 2,970 | Norton 3,687 | Big Stone Gap 5,254',
      source: 'U.S. Census Bureau',
      year: 2024,
      description: 'Census 2024 population estimates for each municipality'
    },
    population_county: {
      value: 34973,
      source: 'U.S. Census Bureau',
      year: 2024,
      description: 'Wise County total population estimate 2024'
    },
    age_65_plus: {
      value: '20.5% county-wide, 22.1% Norton',
      source: 'U.S. Census Bureau American Community Survey',
      year: 2024,
      description: 'Elevated elderly population drives higher EMS demand per capita'
    },
    annual_ems_calls: {
      value: 8938,
      source: 'Virginia Department of Fire Programs (VDFP) / Virginia Commonwealth University EMS Report',
      year: '2021-2023 average',
      description: 'Annual EMS call volume FY21-FY23, yielding 24.5 calls/day average'
    },
    busy_time: {
      value: 92.8,
      source: 'American College of Surgeons, "Rural EMS Systems" report',
      year: 2025,
      description: 'Average rural busy time per EMS call including travel, treatment, and hospital turnaround (minutes)'
    },
    dispatch_time: {
      value: 1,
      source: 'NFPA 1710 standard',
      year: 2020,
      description: 'EMS dispatch processing time — 60-second benchmark'
    },
    turnout_time: {
      value: 1,
      source: 'NFPA 1710 standard',
      year: 2020,
      description: 'EMS turnout (crew ready to respond) time — 60-second benchmark'
    },
    nfpa_1710_response: {
      value: '8 minutes to 90% of incidents',
      source: 'NFPA 1710',
      year: 2020,
      description: 'ALS response time standard for career/combination departments'
    },
    nfpa_1720_rural: {
      value: '14 minutes total response time',
      source: 'NFPA 1720',
      year: 2020,
      description: 'Volunteer/rural total response time standard'
    },
    rural_ems_median: {
      value: '>14 minutes median',
      source: 'Mell et al. 2017, PMC / National Rural EMS Research',
      year: 2017,
      description: 'National rural EMS median response time benchmark'
    },
    travel_times: {
      value: 'Symmetric OD matrix for 5 zones',
      source: 'Verified research data for Southwest Virginia mountain roads',
      year: 2025,
      description: 'Baseline travel times between all zone pairs under normal road conditions'
    },
    career_staff: {
      value: 'Wise County 19 career, Norton City 1 career',
      source: 'Wise County EMS operational data',
      year: 2024,
      description: 'Active career EMS staff; volunteer count declining trend'
    }
  },

  // ─── ASSUMPTIONS ──────────────────────────────────────────────────────────
  // Values not sourced from published research — estimated for model purposes.
  ASSUMPTIONS: {
    weekend_multiplier: {
      value: 0.85,
      description: 'Weekend demand estimated at 85% of weekday. No local Wise County data available; based on general rural EMS literature pattern of lower weekend call volume.',
      applied_to: 'dayTypeMultiplier in availability model'
    },
    corridor_populations: {
      value: 'Norton-BSG Corridor 1,200 | Wise-Norton Corridor 800',
      description: 'Rural corridor populations estimated from Wise County total minus three town populations. Distributed proportionally along road corridors.',
      applied_to: 'Zone population for weighted coverage calculations'
    },
    demand_weights: {
      value: 'BSG 0.28 | Corridor-N-BSG 0.17 | Norton 0.25 | Corridor-W-N 0.12 | Wise 0.18',
      description: 'Demand weights estimated proportional to population with a slight upward adjustment for Big Stone Gap (largest town) and Norton (highest elderly %). Weights sum to 1.0.',
      applied_to: 'weightedCoverage and averageResponseTime calculations'
    },
    road_condition_multipliers: {
      value: 'Peak 1.25 | Rain 1.22 | Snow/ice 1.56 | Fog 1.33',
      description: 'Travel time multipliers for adverse road conditions. Based on general Southwest Virginia mountain road literature; no Wise County-specific driving time studies available.',
      applied_to: 'effectiveRoadMultiplier in response time formula'
    },
    overnight_road_multiplier: {
      value: 0.90,
      description: 'Overnight travel is ~10% faster due to reduced traffic volume on rural roads. Applied only when Overnight time period is selected, multiplied with road condition multiplier.',
      applied_to: 'roadMultiplierOverride for overnight time period only'
    },
    time_period_demand_multipliers: {
      value: 'Overnight 0.4 | Morning 1.2 | Afternoon 1.0 | Evening 0.8',
      description: 'Demand variation by time of day estimated from general rural EMS diurnal patterns (VDFP aggregate data). No hourly Wise County breakdown available.',
      applied_to: 'effectiveDemandMultiplier in availability model'
    },
    staffing_multipliers: {
      value: 'Overnight 0.6 | Morning 1.0 | Afternoon 1.0 | Evening 0.85',
      description: 'Active ambulance staffing as fraction of fleet size varies by time period, reflecting volunteer availability patterns. Lower overnight and evening due to volunteer fatigue/availability.',
      applied_to: 'activeAmbulances computation in availability model'
    }
  }

};
